// Archived-session manager, browser half.
//
// Zero-build hand-written client bundle (same proven pattern as dsh-better-archive
// and dsh-annotation): CJS factory + ModuleLoader wrapper. React is available via
// require("react"); slot components receive framework standard hooks
// (useSessions / useWorkspaces) through props. The host half's HTTP routes
// (/archive-manager/*) are called with plain fetch on the same origin.
//
// Styling follows the DSH settings-surface conventions: the component injects
// one idempotent stylesheet (data-plugin-css) whose colors are the shared
// --dsw-alias-* / --dsw-shadow-* / --dsw-mask-* theme variables, so the panel
// adapts to light/dark theme automatically instead of hardcoding colors.
window.__ModuleLoader__.load({
  // Must equal package.json "name" exactly.
  id: 'dsh-archive-manager',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var createElement = React.createElement
    var refreshSessions = function () {}

    // ------------------------- locale (follows the DSH language setting) -------------------------
    var LOCALE_NS = 'archiveManager'

    /** zh dictionary (also registered into the DSH locale registry under LOCALE_NS). */
    var zhDict = {
      nav: '已归档',
      title: '已归档会话',
      searchPlaceholder: '搜索已归档会话',
      sortBy: '排序依据',
      sortUpdated: '最近更新',
      sortAlpha: '按名称',
      allProjects: '所有项目',
      deleteAll: '清空全部归档',
      noArchived: '暂无已归档会话。',
      noMatch: '没有匹配的已归档会话。',
      chatCount: '{count} 个会话',
      delete: '删除',
      unarchive: '恢复',
      more: '更多',
      deleteProjectContent: '删除此项目全部归档会话',
      uncategorized: '未分类',
      confirmDeleteTitle: '永久删除会话？',
      confirmDeleteBody: '此操作将永久删除所选会话及其记录，且无法恢复。',
      cancel: '取消',
      batchFailed: '有 {failed} 个会话删除失败：',
      project: '项目',
    }

    /** en dictionary (key-set equal to zh). */
    var enDict = {
      nav: 'Archived',
      title: 'Archived sessions',
      searchPlaceholder: 'Search archived sessions',
      sortBy: 'Sort by',
      sortUpdated: 'Last updated',
      sortAlpha: 'Name',
      allProjects: 'All projects',
      deleteAll: 'Delete all',
      noArchived: 'No archived sessions.',
      noMatch: 'No archived sessions match your search.',
      chatCount: '{count} sessions',
      delete: 'Delete',
      unarchive: 'Restore',
      more: 'More',
      deleteProjectContent: 'Delete all archived sessions in this project',
      uncategorized: 'Uncategorized',
      confirmDeleteTitle: 'Delete sessions permanently?',
      confirmDeleteBody: 'This permanently deletes the selected sessions and their records. This cannot be undone.',
      cancel: 'Cancel',
      batchFailed: '{failed} session(s) failed to delete:',
      project: 'Project',
    }

    /** The DSH locale service attached by the client apply (absent -> browser detection). */
    var localeService = undefined

    function attachLocale(service) {
      localeService = service
    }

    /** The active locale id: the DSH locale service snapshot when attached, else the browser language. */
    function activeLocale() {
      var snapshot = localeService && typeof localeService.getSnapshot === 'function'
        ? localeService.getSnapshot()
        : undefined
      var active = snapshot ? snapshot.active : undefined
      if (typeof active === 'string' && active.length > 0) return active
      if (typeof navigator !== 'undefined' && typeof navigator.language === 'string'
        && navigator.language.length > 0) return navigator.language
      return 'zh'
    }

    function isZh() {
      return activeLocale().toLowerCase().indexOf('zh') === 0
    }

    function t(key, params) {
      var dict = isZh() ? zhDict : enDict
      var text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
      if (params) {
        for (var name in params) {
          if (Object.prototype.hasOwnProperty.call(params, name)) {
            text = text.split('{' + name + '}').join(String(params[name]))
          }
        }
      }
      return text
    }

    // ------------------------- stylesheet (DSH theme variables) -------------------------
    var CSS_MARKER = 'dsh-archive-manager'

    // Theme variables are taken from the live token registry (Theme.listTokens):
    // labels/borders/surfaces/states confirmed on the running instance. Token
    // levels the registry does not ship (tertiary text, layer-3, hover
    // backgrounds, shadows) degrade to semantic equivalents: color-mix over a
    // registered token, or a neutral translucent shadow — never a hardcoded
    // ink color, so light/dark adaptation stays theme-driven.
    var pluginCss = '\n'
      + '.am-section{display:flex;flex-direction:column;gap:12px;width:100%;max-width:720px;padding:2px 0 12px}\n'
      + '.am-header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px}\n'
      + '.am-heading{margin:0;font-size:18px;line-height:24px;font-weight:600;color:var(--dsw-alias-label-primary)}\n'
      + '.am-danger-btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:18px;border:none;background:transparent;cursor:pointer;font-size:13px;font-family:inherit;color:var(--dsw-alias-state-error-primary)}\n'
      + '.am-danger-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}\n'
      + '.am-danger-btn:disabled{opacity:.4;cursor:default}\n'
      + '.am-tools{display:flex;gap:10px;align-items:center;width:100%;min-width:0}\n'
      + '.am-search{display:inline-flex;align-items:center;gap:8px;flex:1 1 0;min-width:0;height:36px;padding:0 11px;box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px}\n'
      + '.am-search svg{flex:0 0 auto;color:var(--dsw-alias-label-secondary);opacity:.6}\n'
      + '.am-search:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}\n'
      + '.am-search-input{border:none;outline:none;min-width:0;flex:1 1 auto;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}\n'
      + '.am-search-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.6}\n'
      + '.am-select{height:36px;padding:0 11px;border-radius:8px;flex:0 0 auto;max-width:180px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);font-size:13px;font-family:inherit;cursor:pointer}\n'
      + '.am-select:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}\n'
      + '.am-error{margin:0;font-size:12px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}\n'
      + '.am-empty{margin:0;font-size:13px;color:var(--dsw-alias-label-secondary)}\n'
      + '.am-groups{display:flex;flex-direction:column;gap:20px;max-height:58vh;overflow-y:auto;padding-right:2px}\n'
      + '.am-group{display:flex;flex-direction:column;gap:8px}\n'
      + '.am-group-head{display:flex;align-items:center;gap:8px;min-height:22px}\n'
      + '.am-group-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--dsw-alias-label-secondary)}\n'
      + '.am-group-count{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary)}\n'
      + '.am-group-list{display:flex;flex-direction:column;gap:8px}\n'
      + '.am-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}\n'
      + '.am-row-main{flex:1 1 auto;min-width:0}\n'
      + '.am-row-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n'
      + '.am-row-time{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:3px}\n'
      + '.am-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px}\n'
      + '.am-icon-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-state-error-primary)}\n'
      + '.am-btn{height:28px;padding:0 10px;border-radius:14px;font-size:12px;border:none;cursor:pointer;font-family:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}\n'
      + '.am-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}\n'
      + '.am-btn:disabled,.am-icon-btn:disabled{opacity:.4;cursor:default}\n'
      + '.am-btn:focus-visible,.am-icon-btn:focus-visible,.am-danger-btn:focus-visible{outline:none;box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent)}\n'
      + '.am-menu{position:relative}\n'
      + '.am-menu-backdrop{position:fixed;inset:0;z-index:900}\n'
      + '.am-menu-pop{position:absolute;top:calc(100% + 4px);right:0;z-index:901;min-width:250px;padding:4px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.16)}\n'
      + '.am-menu-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;white-space:nowrap;border:none;border-radius:6px;padding:7px 10px;font-size:13px;cursor:pointer;font-family:inherit;background:transparent;color:var(--dsw-alias-label-primary)}\n'
      + '.am-menu-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}\n'
      + '.am-mask{position:fixed;inset:0;z-index:1200;background:color-mix(in srgb,var(--dsw-alias-bg-base) 55%,transparent);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px}\n'
      + '.am-modal{width:min(480px,100%);background:var(--dsw-alias-bg-overlay);border-radius:16px;padding:22px;border:1px solid var(--dsw-alias-border-l2);box-shadow:0 16px 48px rgba(0,0,0,.18)}\n'
      + '.am-modal-title{margin:0;font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}\n'
      + '.am-modal-body{margin:8px 0 0;font-size:13px;color:var(--dsw-alias-label-secondary)}\n'
      + '.am-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}\n'
      + '.am-cancel-btn{height:36px;padding:0 14px;border-radius:18px;border:none;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px;font-family:inherit}\n'
      + '.am-cancel-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}\n'
      + '.am-delete-btn{height:36px;padding:0 16px;border-radius:18px;border:none;background:var(--dsw-alias-state-error-primary);color:#fff;cursor:pointer;font-size:13px;font-family:inherit}\n'
      + '.am-delete-btn:hover:not(:disabled){filter:brightness(.92)}\n'
      + '.am-cancel-btn:disabled,.am-delete-btn:disabled{opacity:.4;cursor:default}\n'

    /** Inject the stylesheet once; the effect cleanup removes it on fiber disposal. */
    function injectStyles() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="' + CSS_MARKER + '"]') !== null) return
      var tag = document.createElement('style')
      tag.setAttribute('data-plugin-css', CSS_MARKER)
      tag.textContent = pluginCss
      document.head.appendChild(tag)
    }

    function removeStyles() {
      if (typeof document === 'undefined') return
      var tag = document.querySelector('style[data-plugin-css="' + CSS_MARKER + '"]')
      if (tag !== null) tag.remove()
    }

    // ------------------------- tiny UI helpers -------------------------
    function formatDate(ts) {
      if (!ts) return ''
      var d = new Date(ts)
      if (isNaN(d.getTime())) return ''
      function p(n) { return n < 10 ? '0' + n : String(n) }
      if (isZh()) {
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 '
          + p(d.getHours()) + ':' + p(d.getMinutes())
      }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }

    function projectOf(cwd) {
      if (!cwd) return t('uncategorized')
      var parts = String(cwd).replace(/\\/g, '/').split('/').filter(Boolean)
      return parts.length ? parts[parts.length - 1] : t('uncategorized')
    }

    function SearchIcon() {
      return createElement('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        createElement('circle', { cx: 11, cy: 11, r: 7 }),
        createElement('path', { d: 'm20 20-4-4' }),
      )
    }

    function TrashIcon() {
      return createElement('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        createElement('path', { d: 'M3 6h18' }),
        createElement('path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
        createElement('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
        createElement('path', { d: 'M10 11v6' }),
        createElement('path', { d: 'M14 11v6' }),
      )
    }

    // ------------------------- archived-session settings section -------------------------
    function ArchivedSection(props) {
      var tr = props.t || t
      // settings.section slot contract always supplies these standard hooks;
      // the typeof guard is stable across renders of a given composition, so
      // the hook order never varies and an unusual slot host cannot crash the
      // section.
      var list = typeof props.useSessions === 'function'
        ? props.useSessions(function (s) { return s })
        : null
      var wsState = typeof props.useWorkspaces === 'function'
        ? props.useWorkspaces(function (s) { return s })
        : null

      var mountedRef = React.useRef(true)
      var seqRef = React.useRef(0)
      React.useEffect(function () {
        mountedRef.current = true
        return function () { mountedRef.current = false }
      }, [])

      var queryState = React.useState('')
      var query = queryState[0]
      var setQuery = queryState[1]
      var sortState = React.useState('updated')
      var sortBy = sortState[0]
      var setSortBy = sortState[1]
      var projectState = React.useState('all')
      var projectFilter = projectState[0]
      var setProjectFilter = projectState[1]
      var errorState = React.useState(null)
      var error = errorState[0]
      var setError = errorState[1]
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var pendingState = React.useState(null)
      var pendingConfirm = pendingState[0]
      var setPendingConfirm = pendingState[1]

      var archivedIds = wsState ? wsState.archivedSessionIds || [] : []
      var rows = archivedIds.map(function (id) {
        var sid = String(id)
        var summary = list && list.byId ? list.byId[sid] : undefined
        return {
          id: sid,
          title: String(summary ? summary.displayTitle : sid),
          cwd: summary ? summary.cwd : undefined,
          project: projectOf(summary ? summary.cwd : undefined),
          updatedAt: summary ? summary.updatedAt : undefined,
        }
      })

      var q = query.trim().toLowerCase()
      var sorted = rows.slice().sort(function (a, b) {
        if (sortBy === 'alpha') return a.title.localeCompare(b.title, isZh() ? 'zh' : 'en')
        var at = a.updatedAt || 0
        var bt = b.updatedAt || 0
        return bt - at
      })
      var visible = sorted.filter(function (row) {
        if (q && row.title.toLowerCase().indexOf(q) === -1) return false
        if (projectFilter !== 'all' && row.project !== projectFilter) return false
        return true
      })

      var projects = []
      rows.forEach(function (row) {
        if (projects.indexOf(row.project) === -1) projects.push(row.project)
      })
      var groupKeys = []
      rows.forEach(function (row) {
        var key = row.cwd || ''
        if (groupKeys.indexOf(key) === -1) groupKeys.push(key)
      })
      var groups = []
      groupKeys.forEach(function (key) {
        var members = visible.filter(function (row) { return (row.cwd || '') === key })
        if (members.length) groups.push({ key: key, label: projectOf(key), rows: members })
      })

      function toText(value) {
        if (value === null || value === undefined) return ''
        if (typeof value === 'string') return value
        if (typeof value === 'object') {
          try { return JSON.stringify(value) } catch { return String(value) }
        }
        return String(value)
      }

      function describeFailure(res) {
        var parts = []
        if (res && Array.isArray(res.failed) && res.failed.length) {
          parts.push(res.failed.map(function (f) {
            return toText(f && f.id) + ': ' + toText(f && f.error)
          }).join('; '))
        }
        if (res && Array.isArray(res.warnings) && res.warnings.length) {
          parts.push(res.warnings.map(toText).join('; '))
        }
        if (res && res.error) parts.push(toText(res.error))
        return parts.join(' ')
      }

      function act(path, payload) {
        var seq = ++seqRef.current
        setBusy(true)
        setError(null)
        return fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload || {}),
        }).then(function (r) {
          return r.json().catch(function () { return {} }).then(function (res) {
            if (!r.ok || (res && res.error)) {
              throw new Error(describeFailure(res) || 'Request failed (' + r.status + ')')
            }
            return res
          })
        }).then(function (res) {
          if (seq !== seqRef.current || !mountedRef.current) return false
          setBusy(false)
          if (res && res.failed && res.failed.length) {
            setError(tr('batchFailed', { failed: res.failed.length }) + ' ' + describeFailure(res))
          }
          refreshSessions()
          return true
        }).catch(function (e) {
          if (seq !== seqRef.current || !mountedRef.current) return false
          setBusy(false)
          setError(String(e && e.message ? e.message : e))
          return false
        })
      }

      function unarchiveOne(row) { return act('/archive-manager/unarchive', { sessionId: row.id }) }
      function requestDelete(action) { setPendingConfirm(action) }
      function confirmDelete() {
        var action = pendingConfirm
        setPendingConfirm(null)
        if (typeof action === 'function') action()
      }
      function cancelDelete() { setPendingConfirm(null) }
      function deleteOne(row) { requestDelete(function () { act('/archive-manager/delete', { sessionId: row.id }) }) }
      function deleteAll() { requestDelete(function () { act('/archive-manager/delete-all', { confirm: true }) }) }
      function deleteProject(group) {
        requestDelete(function () { act('/archive-manager/delete-project', { cwd: group.key, confirm: true }) })
      }

      function GroupMenu(props) {
        var openState = React.useState(false)
        var open = openState[0]
        var setOpen = openState[1]
        return createElement(
          'div',
          { className: 'am-menu' },
          createElement('button', {
            type: 'button',
            className: 'am-icon-btn',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            'aria-label': tr('more'),
            onClick: function () { setOpen(!open) },
          }, '\u22EF'),
          open ? createElement('div', {
            className: 'am-menu-backdrop',
            onClick: function () { setOpen(false) },
          }) : null,
          open ? createElement('div', { className: 'am-menu-pop' },
            createElement('button', {
              type: 'button',
              className: 'am-menu-item',
              onClick: function () { setOpen(false); props.onDelete() },
            }, tr('deleteProjectContent')),
          ) : null,
        )
      }

      return createElement(
        'div',
        { className: 'am-section' },
        createElement('div', { className: 'am-header' },
          createElement('h1', { className: 'am-heading' }, tr('title')),
          createElement('button', {
            type: 'button',
            className: 'am-danger-btn',
            onClick: deleteAll,
            disabled: busy || rows.length === 0,
          }, TrashIcon(), tr('deleteAll')),
        ),
        createElement('div', { className: 'am-tools' },
          createElement('div', { className: 'am-search' },
            SearchIcon(),
            createElement('input', {
              type: 'search',
              className: 'am-search-input',
              value: query,
              onChange: function (e) { setQuery(e.target.value) },
              placeholder: tr('searchPlaceholder'),
            }),
          ),
          createElement('select', {
            className: 'am-select',
            value: sortBy,
            onChange: function (e) { setSortBy(e.target.value) },
            'aria-label': tr('sortBy'),
          },
            createElement('option', { value: 'updated' }, tr('sortUpdated')),
            createElement('option', { value: 'alpha' }, tr('sortAlpha')),
          ),
          createElement('select', {
            className: 'am-select',
            value: projectFilter,
            onChange: function (e) { setProjectFilter(e.target.value) },
            'aria-label': tr('project'),
          },
            createElement('option', { value: 'all' }, tr('allProjects')),
            projects.map(function (project) {
              return createElement('option', { key: project, value: project }, project)
            }),
          ),
        ),
        error ? createElement('p', { className: 'am-error' }, error) : null,
        rows.length === 0
          ? createElement('p', { className: 'am-empty' }, tr('noArchived'))
          : groups.length === 0
            ? createElement('p', { className: 'am-empty' }, tr('noMatch'))
            : createElement('div', { className: 'am-groups' },
                groups.map(function (group) {
                  return createElement('div', { key: group.key, className: 'am-group' },
                    createElement('div', { className: 'am-group-head' },
                      createElement('span', { className: 'am-group-label' }, group.label),
                      createElement('span', { className: 'am-group-count' },
                        tr('chatCount', { count: group.rows.length })),
                      createElement(GroupMenu, { onDelete: function () { deleteProject(group) } }),
                    ),
                    createElement('div', { className: 'am-group-list' },
                      group.rows.map(function (row) {
                        return createElement(
                          'div',
                          { key: row.id, className: 'am-row' },
                          createElement('div', { className: 'am-row-main' },
                            createElement('div', { className: 'am-row-title' }, row.title),
                            row.updatedAt ? createElement('div', { className: 'am-row-time' },
                              formatDate(row.updatedAt)) : null,
                          ),
                          createElement('button', {
                            type: 'button',
                            className: 'am-icon-btn',
                            'aria-label': tr('delete'),
                            onClick: function () { deleteOne(row) },
                            disabled: busy,
                          }, '\u2715'),
                          createElement('button', {
                            type: 'button',
                            className: 'am-btn',
                            onClick: function () { unarchiveOne(row) },
                            disabled: busy,
                          }, tr('unarchive')),
                        )
                      }),
                    ),
                  )
                }),
              ),
        pendingConfirm ? createElement(
          'div',
          { className: 'am-mask', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('confirmDeleteTitle') },
          createElement(
            'div',
            { className: 'am-modal' },
            createElement('h2', { className: 'am-modal-title' }, tr('confirmDeleteTitle')),
            createElement('p', { className: 'am-modal-body' }, tr('confirmDeleteBody')),
            createElement('div', { className: 'am-modal-actions' },
              createElement('button', {
                type: 'button',
                className: 'am-cancel-btn',
                onClick: cancelDelete,
                disabled: busy,
              }, tr('cancel')),
              createElement('button', {
                type: 'button',
                className: 'am-delete-btn',
                onClick: confirmDelete,
                disabled: busy,
              }, tr('delete')),
            ),
          ),
        ) : null,
      )
    }

    // ------------------------- plugin wiring -------------------------
    function apply(ctx) {
      ctx.effect(function () {
        injectStyles()
        return removeStyles
      }, 'dsh-archive-manager: stylesheet')

      var sessions = ctx.get('sessions')
      if (sessions !== undefined && typeof sessions.refresh === 'function') {
        refreshSessions = function () {
          try {
            Promise.resolve(sessions.refresh()).catch(function (error) {
              console.warn('dsh-archive-manager: session refresh failed:', error)
            })
          } catch (error) {
            console.warn('dsh-archive-manager: session refresh threw:', error)
          }
        }
      }
      var locale = ctx.get('locale')
      if (locale !== undefined && typeof locale.register === 'function') {
        attachLocale(locale)
        ctx.effect(function () {
          var offZh = locale.register(LOCALE_NS, 'zh', zhDict)
          var offEn = locale.register(LOCALE_NS, 'en', enDict)
          return function () { offZh(); offEn() }
        }, 'dsh-archive-manager: locale dictionaries')
        ctx.effect(function () {
          return function () { if (localeService === locale) localeService = undefined }
        }, 'dsh-archive-manager: locale detach')
      }
      var slots = ctx.get('slots')
      if (slots === undefined) return

      var regOptions = {
        name: 'settings.section',
        id: 'archive-manager',
        order: 100,
        label: function () { return t('nav') },
      }
      if (locale !== undefined) regOptions.locale = LOCALE_NS

      return slots.inject('settings.section', function () {
        return slots.register(regOptions, ArchivedSection)
      })
    }

    exports.name = 'dsh-archive-manager'
    exports.inject = ['slots', 'sessions']
    exports.apply = apply

    return module.exports
  },
})