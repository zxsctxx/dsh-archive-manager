// Archived-session manager, browser half.
//
// Zero-build hand-written client bundle (same proven pattern as dsh-better-archive
// and dsh-annotation): CJS factory + ModuleLoader wrapper. React is available via
// require("react"); slot components receive framework standard hooks
// (useSessions / useWorkspaces) through props. The host half's HTTP routes
// (/archive-manager/*) are called with plain fetch on the same origin.
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

    function darkMode() {
      return typeof document === 'undefined' || !document.body
        || document.body.hasAttribute('data-ds-dark-theme')
    }

    var btnBase = {
      border: 'none',
      borderRadius: 7,
      padding: '6px 10px',
      background: 'rgba(128,128,128,0.18)',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: 13,
      fontFamily: 'inherit',
    }

    function nc(num) {
      if (num === null || num === undefined || isNaN(num)) return ''
      return String(num)
    }

    // ------------------------- archived-session settings section -------------------------
    function ArchivedSection(props) {
      var tr = props.t || t
      var list = null
      var wsState = null
      try { list = props.useSessions(function (s) { return s }) } catch (e) { /* hooks unavailable */ }
      try { wsState = props.useWorkspaces(function (s) { return s }) } catch (e) { /* hooks unavailable */ }

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

      var dark = darkMode()
      var modalBg = dark ? '#2c2d30' : '#ffffff'
      var modalText = dark ? '#ffffff' : '#1f2328'
      var modalMuted = dark ? 'rgba(255,255,255,0.65)' : 'rgba(31,35,40,0.65)'
      var modalBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'
      var modalShadow = dark ? '0 16px 48px rgba(0,0,0,0.5)' : '0 16px 48px rgba(0,0,0,0.18)'
      var modalOverlay = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)'
      var modalCancel = dark ? 'rgba(255,255,255,0.9)' : 'rgba(31,35,40,0.85)'
      var modalDeleteBg = dark ? '#6b3536' : '#dc2626'

      var archivedIds = wsState ? wsState.archivedSessionIds || [] : []
      var rows = archivedIds.map(function (id) {
        var sid = String(id)
        var summary = list && list.byId ? list.byId[sid] : undefined
        return {
          id: sid,
          title: summary ? summary.displayTitle : sid,
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

      function describeFailure(res) {
        var parts = []
        if (res && res.failed && res.failed.length) {
          parts.push(res.failed.map(function (f) { return nc(f.id) + ': ' + (f.error || 'unknown') }).join('; '))
        }
        if (res && res.warnings && res.warnings.length) parts.push(res.warnings.join('; '))
        if (res && res.error) parts.push(res.error)
        return parts.join(' ')
      }

      function act(path, payload) {
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
          setBusy(false)
          if (res && res.failed && res.failed.length) {
            setError(tr('batchFailed', { failed: res.failed.length }) + ' ' + describeFailure(res))
          }
          refreshSessions()
          return true
        }).catch(function (e) {
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

      function Menu(props) {
        var openState = React.useState(false)
        var open = openState[0]
        var setOpen = openState[1]
        return createElement(
          'div',
          { style: { position: 'relative' } },
          createElement('button', {
            type: 'button',
            'aria-label': tr('more'),
            onClick: function () { setOpen(!open) },
            style: { ...btnBase, background: 'transparent', padding: '2px 8px', fontSize: 16, lineHeight: '1' },
          }, '\u22EF'),
          open ? createElement('div', {
            onClick: function () { setOpen(false) },
            style: { position: 'fixed', inset: 0, zIndex: 900 },
          }) : null,
          open ? createElement('div', {
            style: {
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 901,
              minWidth: 250, padding: 4,
              background: modalBg, color: modalText,
              border: '1px solid ' + modalBorder, borderRadius: 8, boxShadow: modalShadow,
            },
          },
            createElement('button', {
              type: 'button',
              onClick: function () { setOpen(false); props.onDelete() },
              style: {
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                whiteSpace: 'nowrap', border: 'none', borderRadius: 6, padding: '7px 10px',
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                background: 'transparent', color: modalText,
              },
            }, tr('deleteProjectContent')),
          ) : null,
        )
      }

      var controlStyle = {
        display: 'inline-flex', alignItems: 'center', gap: 8, flex: '1 1 0', width: 0, minWidth: 0,
        background: 'rgba(128,128,128,0.08)', color: 'inherit',
        border: '1px solid rgba(128,128,128,0.25)', borderRadius: 7,
        padding: '0 11px', height: 38, fontSize: 14, fontFamily: 'inherit',
        boxSizing: 'border-box',
      }

      return createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 704, padding: '2px 0 12px' } },
        createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36 } },
          createElement('h1', { style: { margin: 0, fontSize: 24, lineHeight: '32px', fontWeight: 600 } }, tr('title')),
          createElement('button', {
            type: 'button',
            onClick: deleteAll,
            disabled: busy || rows.length === 0,
            style: {
              border: 'none', borderRadius: 7, padding: '8px 13px',
              background: 'rgba(229,83,75,0.16)', color: '#e5534b',
              cursor: 'pointer', fontSize: 13,
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
              opacity: busy || rows.length === 0 ? 0.5 : 1,
            },
          }, tr('deleteAll')),
        ),
        createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center', width: '100%', minWidth: 0 } },
          createElement('div', { style: controlStyle },
            createElement('input', {
              type: 'search', value: query, onChange: function (e) { setQuery(e.target.value) },
              placeholder: tr('searchPlaceholder'),
              style: { border: 'none', outline: 'none', minWidth: 0, flex: '1 1 auto',
                background: 'transparent', color: 'inherit', fontSize: 14, fontFamily: 'inherit' },
            }),
          ),
          createElement('select', {
            value: sortBy, onChange: function (e) { setSortBy(e.target.value) },
            'aria-label': tr('sortBy'),
            style: { ...controlStyle, width: 'auto', flex: '0 0 auto', cursor: 'pointer' },
          },
            createElement('option', { value: 'updated' }, tr('sortUpdated')),
            createElement('option', { value: 'alpha' }, tr('sortAlpha')),
          ),
          createElement('select', {
            value: projectFilter, onChange: function (e) { setProjectFilter(e.target.value) },
            'aria-label': tr('project'),
            style: { ...controlStyle, width: 'auto', flex: '0 0 auto', cursor: 'pointer', maxWidth: 180 },
          },
            createElement('option', { value: 'all' }, tr('allProjects')),
            projects.map(function (project) {
              return createElement('option', { key: project, value: project }, project)
            }),
          ),
        ),
        error ? createElement('p', { style: { fontSize: 12, color: '#e5534b', margin: 0, whiteSpace: 'pre-wrap' } }, error) : null,
        rows.length === 0
          ? createElement('p', { style: { fontSize: 13, opacity: 0.6, margin: 0 } }, tr('noArchived'))
          : groups.length === 0
            ? createElement('p', { style: { fontSize: 13, opacity: 0.6, margin: 0 } }, tr('noMatch'))
            : createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '58vh', overflowY: 'auto', paddingRight: 2 } },
                groups.map(function (group) {
                  return createElement('div', { key: group.key, style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                    createElement('div', {
                      style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 22, fontSize: 14,
                        color: dark ? 'rgba(255,255,255,0.86)' : 'rgba(31,35,40,0.86)' },
                    },
                      createElement('span', {
                        style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', fontWeight: 600 },
                      }, group.label),
                      createElement('span', {
                        style: { marginLeft: 'auto', fontSize: 13,
                          color: dark ? 'rgba(255,255,255,0.66)' : 'rgba(31,35,40,0.58)' },
                      }, tr('chatCount', { count: group.rows.length })),
                      createElement(Menu, { onDelete: function () { deleteProject(group) } }),
                    ),
                    createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                      group.rows.map(function (row) {
                        return createElement(
                          'div',
                          {
                            key: row.id,
                            style: {
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '13px 14px', borderRadius: 8,
                              background: 'rgba(128,128,128,0.075)',
                              border: '1px solid rgba(128,128,128,0.16)',
                            },
                          },
                          createElement('div', { style: { flex: '1 1 auto', minWidth: 0 } },
                            createElement('div', {
                              style: { fontSize: 14, fontWeight: 500, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                            }, row.title),
                            row.updatedAt ? createElement('div', {
                              style: { fontSize: 12, opacity: 0.6, marginTop: 3 },
                            }, formatDate(row.updatedAt)) : null,
                          ),
                          createElement('button', {
                            type: 'button',
                            onClick: function () { deleteOne(row) },
                            disabled: busy,
                            style: { ...btnBase, background: 'transparent',
                              color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(31,35,40,0.58)',
                              padding: '4px', display: 'inline-flex', alignItems: 'center',
                              justifyContent: 'center', opacity: busy ? 0.5 : 1 },
                          }, '\u2715'),
                          createElement('button', {
                            type: 'button',
                            onClick: function () { unarchiveOne(row) },
                            disabled: busy,
                            style: { ...btnBase, padding: '7px 11px', fontSize: 13, fontWeight: 500,
                              background: 'rgba(128,128,128,0.16)', opacity: busy ? 0.5 : 1 },
                          }, tr('unarchive')),
                        )
                      }),
                    ),
                  )
                }),
              ),
        pendingConfirm ? createElement(
          'div',
          { style: { position: 'fixed', inset: 0, zIndex: 1200, background: modalOverlay,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
          createElement(
            'div',
            { style: { width: 360, maxWidth: '90vw', background: modalBg, borderRadius: 14, padding: 22,
              border: '1px solid ' + modalBorder, boxShadow: modalShadow } },
            createElement('h2', { style: { margin: 0, fontSize: 16, fontWeight: 600, color: modalText } },
              tr('confirmDeleteTitle')),
            createElement('p', { style: { margin: '8px 0 0', fontSize: 13, color: modalMuted } },
              tr('confirmDeleteBody')),
            createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 } },
              createElement('button', {
                type: 'button', onClick: cancelDelete, disabled: busy,
                style: { border: 'none', background: 'transparent', color: modalCancel,
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  fontFamily: 'inherit', opacity: busy ? 0.5 : 1 },
              }, tr('cancel')),
              createElement('button', {
                type: 'button', onClick: confirmDelete, disabled: busy,
                style: { border: 'none', borderRadius: 8, padding: '8px 16px', background: modalDeleteBg,
                  color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                  opacity: busy ? 0.5 : 1 },
              }, tr('delete')),
            ),
          ),
        ) : null,
      )
    }

    // ------------------------- plugin wiring -------------------------
    function apply(ctx) {
      var sessions = ctx.get('sessions')
      if (sessions !== undefined && typeof sessions.refresh === 'function') {
        refreshSessions = function () { sessions.refresh().catch(function () {}) }
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