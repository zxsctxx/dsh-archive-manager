/**
 * Archived-session manager plugin, host half.
 *
 * DSH's WorkspaceRegistry exposes `archiveSession` and the durable
 * `archivedSessionIds` getter, but no way to remove an id and no session-log
 * deletion. This half registers HTTP routes on the DSH web server and drives
 * the registry's serialized state machine directly:
 *
 *   POST /archive-manager/unarchive      -> body { sessionId }
 *   POST /archive-manager/delete         -> body { sessionId }
 *   POST /archive-manager/delete-all     -> body { confirm: true }
 *   POST /archive-manager/delete-project -> body { cwd, confirm: true }
 *
 * Deletion supports both first-party persistence backends:
 *   - JSONL  (default): one directory per session, removed recursively;
 *   - SQLite (`dsh-session-persistence-sqlite`): rows for the session and its
 *     events are deleted from the store's own database file.
 *
 * Batch operations isolate per-session failures: one corrupt or running
 * session never blocks the rest, and the response reports every failure.
 * Live (running) sessions are refused instead of being forcibly detached, so
 * a batch cannot tear down an agent mid-turn.
 *
 * The browser half (lib/client.js) is discovered by client-modules through the
 * `dsh.client` declaration in package.json and calls these routes with plain
 * fetch (same origin as the web app).
 */
import { rm } from 'node:fs/promises'
import { dirname, normalize, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const name = 'archive-manager'

/** Host services required before mounting. */
const inject = ['webServer', 'workspaceRegistry', 'sessionPersistence', 'sessions']

/** Minimal same-origin/localhost browser trust check for the routes. */
function isTrustedRequest(req) {
  const host = req.headers.host ?? ''
  const referer = req.headers.referer ?? ''
  try {
    return referer !== '' && new URL(referer).host === host
  } catch {
    return false
  }
}

/** Read a bounded JSON body. */
function readJsonBody(req) {
  return new Promise((resolve_, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve_(raw === '' ? {} : JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/** Write a JSON response. */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function messageOf(error) {
  return error instanceof Error && error.message ? error.message : String(error)
}

function sameCwd(left, right) {
  return typeof left === 'string' && normalize(left).toLowerCase() === normalize(right).toLowerCase()
}

function archivedIds(registry) {
  return registry.requireState().archivedSessionIds.map(String)
}

function removeArchiveId(state, id) {
  return {
    ...state,
    archivedSessionIds: state.archivedSessionIds.filter((sid) => String(sid) !== id),
  }
}

/** One archived session: its id plus the immutable header used to locate its storage. */
async function archivedSessionRecord(persistence, id) {
  const inspected = await persistence.inspect(id)
  return { id: String(id), meta: inspected.meta }
}

/**
 * Permanently remove one session's durable storage, dispatching on the
 * persistence backend. JSONL sessions own a directory; SQLite sessions are
 * rows in a single database file (events first, then the session row, so the
 * delete does not depend on the foreign-key pragma being enabled).
 * @returns resolution after the durable removal.
 */
async function deleteStoredSession(persistence, record) {
  const location = persistence.locate(record.meta)
  if (location !== undefined && location.kind === 'jsonl') {
    // The JSONL artifact lives in a session-owned directory.
    await rm(dirname(location.path), { recursive: true, force: true })
    return
  }
  const config = persistence.config
  if (config === undefined || typeof config.path !== 'string') {
    throw new Error(`session '${record.id}': persistence backend is not supported for deletion`)
  }
  const db = new DatabaseSync(resolve(config.path))
  let began = false
  try {
    db.exec('BEGIN')
    began = true
    db.prepare('DELETE FROM events WHERE session_id = ?').run(record.id)
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(record.id)
    db.exec('COMMIT')
    began = false
    if (result.changes === 0) {
      throw new Error(`session '${record.id}' was not found in the SQLite store`)
    }
  } catch (error) {
    if (began) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // The original deletion error remains the actionable cause.
      }
    }
    throw error
  } finally {
    db.close()
  }
}

async function detachFromWorkspace(registry, id) {
  const workspace = registry.list().find((entity) => entity.sessionIds.includes(id))
  if (workspace !== undefined) await workspace.detachSession(id)
}

/**
 * Permanently remove ONE archived session and its workspace accounting.
 * Deletion order puts the irreversible storage removal first: any failure
 * before it leaves the archive set untouched, and a failure after it reports
 * the residual accounting state through the returned warnings.
 * @returns the updated archive set, plus warnings for residual bookkeeping.
 */
async function deleteArchivedSession(ctx, registry, persistence, record) {
  const state = registry.requireState()
  if (!state.archivedSessionIds.some((sid) => String(sid) === record.id)) {
    throw new Error(`session '${record.id}' is not archived`)
  }
  const sessions = ctx.get('sessions')
  const live = sessions !== undefined ? sessions.get(record.id) : undefined
  if (live !== undefined) {
    throw new Error(`session '${record.id}' is currently running; stop it before deleting`)
  }
  const warnings = []
  await deleteStoredSession(persistence, record)
  let next = state
  try {
    next = removeArchiveId(state, record.id)
    await registry.setState(next)
  } catch (error) {
    warnings.push(`archive set update failed for '${record.id}': ${messageOf(error)}`)
  }
  try {
    await detachFromWorkspace(registry, record.id)
  } catch (error) {
    warnings.push(`workspace detach failed for '${record.id}': ${messageOf(error)}`)
  }
  return { archived: next.archivedSessionIds.map(String), warnings }
}

/**
 * Batch-delete archived sessions with per-session failure isolation: a corrupt
 * log, a running agent, or a storage fault fails only its own entry and is
 * reported; the header index is rebuilt once after the batch.
 */
async function deleteArchivedBatch(ctx, registry, persistence, ids) {
  const failed = []
  const records = []
  for (const id of ids) {
    try {
      records.push(await archivedSessionRecord(persistence, id))
    } catch (error) {
      failed.push({ id, error: messageOf(error) })
    }
  }
  const warnings = []
  let remaining = archivedIds(registry)
  for (const record of records) {
    try {
      const result = await deleteArchivedSession(ctx, registry, persistence, record)
      remaining = result.archived
      warnings.push(...result.warnings)
    } catch (error) {
      failed.push({ id: record.id, error: messageOf(error) })
    }
  }
  try {
    await registry.replaceHeaderIndex(await persistence.list())
  } catch (error) {
    warnings.push(`header index rebuild failed: ${messageOf(error)}`)
  }
  return { archived: remaining, deleted: records.length, failed, warnings }
}

/** Run one route guard set: method, trust, body, then the handler. */
function route(req, res, requiredConfirm) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return null
  }
  if (!isTrustedRequest(req)) {
    sendJson(res, 403, { error: 'untrusted request' })
    return null
  }
  return readJsonBody(req).then(
    (body) => {
      if (requiredConfirm && body?.confirm !== true) {
        sendJson(res, 400, { error: 'confirmation required' })
        return null
      }
      return body
    },
    () => {
      sendJson(res, 400, { error: 'invalid body' })
      return null
    },
  )
}

function apply(ctx) {
  const registry = ctx.get('workspaceRegistry')
  const persistence = ctx.get('sessionPersistence')

  // POST /archive-manager/unarchive — remove one session from the archive set.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/archive-manager/unarchive',
    handler: async (req, res) => {
      const body = await route(req, res, false)
      if (body === null) return
      const id = body?.sessionId
      if (typeof id !== 'string' || id.length === 0) {
        return sendJson(res, 400, { error: 'sessionId is required' })
      }
      try {
        const archived = await registry.enqueueOperation(async () => {
          const state = registry.requireState()
          if (!state.archivedSessionIds.some((sid) => String(sid) === id)) return archivedIds(registry)
          const next = removeArchiveId(state, id)
          await registry.setState(next)
          return next.archivedSessionIds.map(String)
        })
        sendJson(res, 200, { archived })
      } catch (error) {
        sendJson(res, 500, { error: messageOf(error) })
      }
    },
  }), 'archive-manager: /archive-manager/unarchive route')

  // POST /archive-manager/delete — permanently delete one archived session.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/archive-manager/delete',
    handler: async (req, res) => {
      const body = await route(req, res, false)
      if (body === null) return
      const id = body?.sessionId
      if (typeof id !== 'string' || id.length === 0) {
        return sendJson(res, 400, { error: 'sessionId is required' })
      }
      try {
        const result = await registry.enqueueOperation(() => deleteArchivedBatch(ctx, registry, persistence, [id]))
        if (result.failed.length > 0) {
          return sendJson(res, 500, {
            error: result.failed.map((f) => f.error).join('; '),
            failed: result.failed,
          })
        }
        sendJson(res, 200, { archived: result.archived, warnings: result.warnings })
      } catch (error) {
        sendJson(res, 500, { error: messageOf(error) })
      }
    },
  }), 'archive-manager: /archive-manager/delete route')

  // POST /archive-manager/delete-all — permanently delete every archived session.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/archive-manager/delete-all',
    handler: async (req, res) => {
      const body = await route(req, res, true)
      if (body === null) return
      try {
        const result = await registry.enqueueOperation(() =>
          deleteArchivedBatch(ctx, registry, persistence, archivedIds(registry)))
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 500, { error: messageOf(error) })
      }
    },
  }), 'archive-manager: /archive-manager/delete-all route')

  // POST /archive-manager/delete-project — permanently delete every archived
  // session whose header cwd belongs to one project directory.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/archive-manager/delete-project',
    handler: async (req, res) => {
      const body = await route(req, res, true)
      if (body === null) return
      const cwd = body?.cwd
      if (typeof cwd !== 'string' || cwd.length === 0) {
        return sendJson(res, 400, { error: 'cwd is required' })
      }
      try {
        const result = await registry.enqueueOperation(async () => {
          // Match by the durable header cwd; unreadable records simply cannot
          // match and are left untouched (deleteArchivedBatch is never asked
          // to reason about them).
          const ids = []
          for (const id of archivedIds(registry)) {
            try {
              const record = await archivedSessionRecord(persistence, id)
              if (sameCwd(record.meta.cwd, cwd)) ids.push(id)
            } catch {
              // Corrupt/unreadable: excluded from this project's selection.
            }
          }
          return deleteArchivedBatch(ctx, registry, persistence, ids)
        })
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 500, { error: messageOf(error) })
      }
    },
  }), 'archive-manager: /archive-manager/delete-project route')

  console.log('[archive-manager] host routes ready')
}

export { apply, inject }