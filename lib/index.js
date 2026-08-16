/**
 * Archived-session manager plugin, host half.
 *
 * DSH's WorkspaceRegistry exposes `archiveSession` and the durable
 * `archivedSessionIds` getter, but no way to remove an id and no session-log
 * deletion. This half registers HTTP routes on the DSH web server and drives
 * the registry's serialized state machine directly:
 *
 *   POST /archive-manager/unarchive      -> body { sessionId, confirm: true }
 *   POST /archive-manager/delete         -> body { sessionId, confirm: true }
 *   POST /archive-manager/delete-all     -> body { confirm: true }
 *   POST /archive-manager/delete-project -> body { cwd, confirm: true }
 *   POST /archive-manager/archive-ungrouped -> body { sessionIds, confirm: true }
 *
 * Deletion targets the official JSONL persistence backend (one directory per
 * session). Any other backend is refused with an explicit "not supported"
 * error instead of guessing at an unverified storage layout.
 *
 * All routes require an `application/json` Content-Type and same-origin
 * request; every destructive route additionally requires `confirm: true`.
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
import { readdir, realpath, rm } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'

export const name = 'archive-manager'

/** Host services required before mounting. */
const inject = ['webServer', 'workspaceRegistry', 'sessionPersistence', 'sessions']

/** Minimal same-origin/localhost browser trust check for the routes. */
function isTrustedRequest(req) {
  const host = (req.headers.host ?? '').toLowerCase()
  // Origin is the authoritative CSRF signal; Referer only as a fallback for
  // clients that omit it. Hosts are compared case-insensitively.
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.length > 0) {
    try {
      return new URL(origin).host.toLowerCase() === host
    } catch {
      return false
    }
  }
  const referer = req.headers.referer ?? ''
  try {
    return referer !== '' && new URL(referer).host.toLowerCase() === host
  } catch {
    return false
  }
}

/**
 * Read a bounded JSON body; each request settles exactly once. Requests whose
 * Content-Type is not JSON are refused with a 415 so that a text/plain simple
 * request (which bypasses CORS preflight) can never reach a route handler.
 */
function readJsonBody(req) {
  return new Promise((resolve_, reject) => {
    let size = 0
    let settled = false
    const chunks = []
    const fail = (statusCode, message) => {
      if (settled) return
      settled = true
      const error = new Error(message)
      error.statusCode = statusCode
      reject(error)
    }
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
    const contentType = (req.headers['content-type'] ?? '').toLowerCase()
    if (!contentType.includes('application/json')) {
      fail(415, 'content-type must be application/json')
      return
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > 64 * 1024) {
        fail(413, 'body too large')
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        finish(resolve_, raw === '' ? {} : JSON.parse(raw))
      } catch (error) {
        finish(reject, error)
      }
    })
    req.on('error', (error) => finish(reject, error))
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

/** Whether a persistence read failed because the session has no stored record. */
function isMissingSessionError(id, error) {
  return error instanceof Error && error.message === `session "${id}" not found`
}

function archivedIds(registry) {
  return registry.requireState().archivedSessionIds.map(String)
}

/** Archive the caller's current ungrouped selection, isolating per-session failures. */
async function archiveUngroupedBatch(registry, ids) {
  const accounted = new Set()
  for (const workspace of registry.list()) {
    for (const sessionId of workspace.sessionIds) accounted.add(String(sessionId))
  }
  const failed = []
  const archived = new Set(archivedIds(registry))
  let archivedCount = 0
  for (const id of [...new Set(ids)]) {
    if (accounted.has(id) || archived.has(id)) continue
    try {
      await registry.archiveSession(id)
      archived.add(id)
      archivedCount += 1
    } catch (error) {
      failed.push({ id, error: messageOf(error) })
    }
  }
  return { archived: [...archived], archivedCount, failed }
}

function removeArchiveId(state, id) {
  return {
    ...state,
    archivedSessionIds: state.archivedSessionIds.filter((sid) => String(sid) !== id),
  }
}

/**
 * One archived session: its id plus the immutable header used to locate its
 * storage. A session whose stored record is gone (`missing: true`) can carry
 * no header — the archive set references it, but there is nothing to delete.
 */
async function archivedSessionRecord(persistence, id) {
  try {
    const inspected = await persistence.inspect(id)
    return { id: String(id), meta: inspected.meta, missing: false }
  } catch (error) {
    if (isMissingSessionError(id, error)) return { id: String(id), missing: true }
    throw error
  }
}

/** Escape a session id to one safe filesystem segment, mirroring the JSONL backend. */
function encodeSegment(raw) {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/**
 * Permanently remove one session's durable storage. Only backends whose
 * `locate` resolves a JSONL artifact (the official DSH persistence backend)
 * are supported; anything else is refused loudly instead of guessing at an
 * unverified storage layout.
 * @returns resolution after the durable removal.
 */
async function deleteStoredSession(persistence, record) {
  if (typeof persistence.locate !== 'function') {
    throw new Error(`session '${record.id}': persistence backend is not supported for deletion`)
  }
  const location = persistence.locate(record.meta)
  if (location !== undefined && location.kind === 'jsonl') {
    // The JSONL artifact lives in a session-owned directory.
    await rm(dirname(location.path), { recursive: true, force: true })
    return
  }
  throw new Error(`session '${record.id}': persistence backend is not supported for deletion`)
}

/**
 * Locate a session's directory across project directories, matching the raw
 * id and its backend-encoded segment form (ids containing `~`, spaces, CJK,
 * or other unsafe characters are stored encoded).
 */
async function findJsonlSessionDir(root, id) {
  if (/[\\/:]/.test(id) || id === '.' || id === '..') {
    throw new Error(`session '${id}' has an unsafe identifier`)
  }
  const idSegment = encodeSegment(id)
  let projects
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    for (const segment of [id, idSegment]) {
      const candidate = join(root, project.name, segment)
      try {
        const entries = await readdir(candidate)
        if (entries.some((entry) => entry === 'session.jsonl' || entry === 'session.jsonl.zstd')) return candidate
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }
  return undefined
}

/** Remove storage without parsing the damaged log. */
async function forceDeleteStoredSession(persistence, id) {
  const config = persistence.config
  if (config === undefined || typeof config.root !== 'string') {
    throw new Error(`session '${id}': persistence backend is not supported for force deletion`)
  }
  const directory = await findJsonlSessionDir(resolve(config.root), id)
  if (directory === undefined) return false
  // Refuse to delete through a symlink/junction that escapes the session root.
  const rootReal = await realpath(resolve(config.root))
  const dirReal = await realpath(directory)
  const prefix = rootReal.endsWith(sep) ? rootReal : rootReal + sep
  if (dirReal !== rootReal && !dirReal.startsWith(prefix)) {
    throw new Error(`session '${id}': resolved directory escapes the session root`)
  }
  await rm(directory, { recursive: true, force: true })
  return true
}

async function forceDeleteArchivedSession(ctx, registry, persistence, id) {
  const state = registry.requireState()
  if (!state.archivedSessionIds.some((sid) => String(sid) === id)) {
    throw new Error(`session '${id}' is not archived`)
  }
  const sessions = ctx.get('sessions')
  if (sessions !== undefined && sessions.get(id) !== undefined) {
    throw new Error(`session '${id}' is currently running; stop it before deleting`)
  }
  const warnings = []
  const removed = await forceDeleteStoredSession(persistence, id)
  if (!removed) warnings.push(`storage for '${id}' was already missing`)
  const next = removeArchiveId(state, id)
  await registry.setState(next)
  try {
    await detachFromWorkspace(registry, id)
  } catch (error) {
    warnings.push(`workspace detach failed for '${id}': ${messageOf(error)}`)
  }
  return { archived: next.archivedSessionIds.map(String), warnings }
}

async function forceDeleteArchivedBatch(ctx, registry, persistence, ids) {
  const failed = []
  const warnings = []
  let remaining = archivedIds(registry)
  let deleted = 0
  for (const id of [...new Set(ids)]) {
    try {
      const result = await forceDeleteArchivedSession(ctx, registry, persistence, id)
      remaining = result.archived
      deleted += 1
      warnings.push(...result.warnings)
    } catch (error) {
      failed.push({ id, error: messageOf(error) })
    }
  }
  try {
    await registry.replaceHeaderIndex(await persistence.list())
  } catch (error) {
    warnings.push(`header index rebuild failed: ${messageOf(error)}`)
  }
  return { archived: remaining, deleted, failed, warnings }
}

async function inspectArchivedHealth(persistence, id) {
  try {
    await persistence.inspect(id)
    return { id, status: 'ok' }
  } catch (error) {
    return {
      id,
      status: isMissingSessionError(id, error) ? 'missing' : 'corrupt',
      error: messageOf(error),
    }
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
 * the residual accounting state through the returned warnings. A record whose
 * stored log is already gone (`missing`) has nothing to delete — its archive
 * entry and accounting slot are cleaned up like a successful removal.
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
  if (!record.missing) await deleteStoredSession(persistence, record)
  // Storage is already gone; the archive set MUST forget the id or the set
  // would reference a deleted session forever. A failure here is not a soft
  // warning: it is thrown so the caller reports the residual state and never
  // treats the session as successfully removed.
  const next = removeArchiveId(state, record.id)
  await registry.setState(next)
  try {
    await detachFromWorkspace(registry, record.id)
  } catch (error) {
    // Detach is best-effort: the filtered `sessionIds` projection drops ids
    // whose header vanished once replaceHeaderIndex rebuilds.
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
  let deleted = 0
  for (const record of records) {
    try {
      const result = await deleteArchivedSession(ctx, registry, persistence, record)
      // Only a committed removal advances the reported archive set: a throw
      // above leaves `remaining` reflecting the registry's actual state.
      remaining = result.archived
      deleted += 1
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
  return { archived: remaining, deleted, failed, warnings }
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
    (error) => {
      const statusCode = error && error.statusCode === 415 ? 415 : 400
      const message = statusCode === 415
        ? 'content-type must be application/json'
        : 'invalid body'
      sendJson(res, statusCode, { error: message })
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
      const body = await route(req, res, true)
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
      const body = await route(req, res, true)
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

  // POST /archive-manager/inspect — classify archived records without exposing log contents.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/archive-manager/inspect',
    handler: async (req, res) => {
      const body = await route(req, res, false)
      if (body === null) return
      const ids = body?.sessionIds
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
        return sendJson(res, 400, { error: 'sessionIds must be a non-empty string array' })
      }
      try {
        const health = await Promise.all([...new Set(ids)].map((id) => inspectArchivedHealth(persistence, id)))
        sendJson(res, 200, { items: health })
      } catch (error) {
        sendJson(res, 500, { error: messageOf(error) })
      }
    },
  }), 'archive-manager: /archive-manager/inspect route')

  // POST /archive-manager/force-delete — remove one or more damaged archived sessions without parsing logs.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/archive-manager/force-delete',
    handler: async (req, res) => {
      const body = await route(req, res, true)
      if (body === null) return
      const ids = body?.sessionIds
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
        return sendJson(res, 400, { error: 'sessionIds must be a non-empty string array' })
      }
      try {
        const result = await registry.enqueueOperation(() => forceDeleteArchivedBatch(ctx, registry, persistence, ids))
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 500, { error: messageOf(error) })
      }
    },
  }), 'archive-manager: /archive-manager/force-delete route')

  // POST /archive-manager/archive-ungrouped — archive the visible ungrouped selection.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/archive-manager/archive-ungrouped',
    handler: async (req, res) => {
      const body = await route(req, res, true)
      if (body === null) return
      const ids = body?.sessionIds
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
        return sendJson(res, 400, { error: 'sessionIds must be a non-empty string array' })
      }
      try {
        const result = await registry.enqueueOperation(() => archiveUngroupedBatch(registry, ids))
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 500, { error: messageOf(error) })
      }
    },
  }), 'archive-manager: /archive-manager/archive-ungrouped route')

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
          // Match by the durable header cwd; records with no stored log cannot
          // carry a cwd and are excluded from this project's selection.
          const ids = []
          for (const id of archivedIds(registry)) {
            try {
              const record = await archivedSessionRecord(persistence, id)
              if (!record.missing && sameCwd(record.meta.cwd, cwd)) ids.push(id)
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