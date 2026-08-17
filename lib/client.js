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
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    var Menu = primitives.Menu
    var IconChevronDownOutline14 = primitives.IconChevronDownOutline14
    var MarkdownText = primitives.MarkdownText
    var MessageText = primitives.MessageText
    var JsonBlock = primitives.JsonBlock
    var DisclosureRow = primitives.DisclosureRow
    var Modal = primitives.Modal
    var createElement = React.createElement
    var refreshSessions = function () {}
    var workspacesService = undefined

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
       copyId: '复制会话 ID',
       copied: '已复制',
      deleteAll: '清空全部归档',
       archiveUngrouped: '归档未分组 ({count})',
       confirmArchiveTitle: '归档未分组会话？',
       confirmArchiveBody: '这会将当前“未分组”中的 {count} 个会话移入归档，不会删除会话记录。',
       archive: '归档',
       archiveUngroupedMenu: '归档未分组会话',
       archiveUngroupedTitle: '未分组会话 ({count})',
       archiveUngroupedHint: '这些会话尚未归入任何工作区',
       corrupt: '日志损坏',
       missing: '记录缺失',
       forceDelete: '强制删除',
       forceDeleteTitle: '强制删除损坏会话？',
       forceDeleteBody: '该会话日志已损坏或缺失。强制删除会直接移除会话文件和归档记录，且无法恢复。',
       forceDeleteButton: '永久强制删除',
       healthCheckFailed: '无法检查会话日志状态',
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
      batchFailed: '有 {failed} 个会话操作失败：',
      project: '项目',
      'error.running': '该会话正在运行，请先停止它或重启 DSH 后再删除。',
      view: '查看',
      viewerTitle: '会话内容',
      viewerClose: '关闭',
      viewerLoading: '正在加载会话内容…',
      viewerEmpty: '该会话没有可展示的内容。',
      viewerError: '无法读取会话内容',
      viewerUser: '用户',
      viewerAssistant: '助手',
      viewerTool: '工具',
      viewerReasoning: '思考过程',
      viewerArgs: '参数',
      viewerResult: '结果',
      viewerImage: '图片',
      viewerTodo: '待办',
      viewerTurn: '第 {n} 轮',
      viewerStep: '第 {n} 步',
      viewerTurnEnd: '第 {n} 轮结束',
      viewerStepEnd: '第 {n} 步结束',
      viewerRequest: '请求上下文',
      viewerRequestHeader: '请求配置',
      viewerSeedEnd: '历史种子结束',
      viewerReasonCompleted: '完成',
      viewerReasonAborted: '已中止',
      viewerReasonBlocked: '已阻塞',
      viewerReasonError: '出错',
      viewerReasonMaxTokens: '达到输出上限',
      viewerReasonInterrupted: '中断',
      viewerReasonUnknown: '未知原因',
      viewerUsage: 'tokens',
      viewerFailure: '失败',
      viewerSkipped: '已跳过',
      viewerImageMeta: '{w}×{h} · {media} · {bytes} 字节',
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
       copyId: 'Copy session ID',
       copied: 'Copied',
      deleteAll: 'Delete all',
       archiveUngrouped: 'Archive ungrouped ({count})',
       confirmArchiveTitle: 'Archive ungrouped sessions?',
       confirmArchiveBody: 'This moves {count} ungrouped sessions into the archive. Session records are kept.',
       archive: 'Archive',
       archiveUngroupedMenu: 'Archive ungrouped sessions',
       archiveUngroupedTitle: 'Ungrouped sessions ({count})',
       archiveUngroupedHint: 'These sessions are not assigned to a workspace',
       corrupt: 'Log corrupted',
       missing: 'Record missing',
       forceDelete: 'Force delete',
       forceDeleteTitle: 'Force-delete damaged session?',
       forceDeleteBody: 'This session log is damaged or missing. Force deletion removes its storage and archive record permanently.',
       forceDeleteButton: 'Force delete permanently',
       healthCheckFailed: 'Unable to check session log status',
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
      batchFailed: '{failed} session(s) failed:',
      project: 'Project',
      'error.running': 'This session is currently running. Stop it or restart DSH before deleting.',
      view: 'View',
      viewerTitle: 'Session content',
      viewerClose: 'Close',
      viewerLoading: 'Loading session content…',
      viewerEmpty: 'This session has no viewable content.',
      viewerError: 'Failed to load session content',
      viewerUser: 'User',
      viewerAssistant: 'Assistant',
      viewerTool: 'Tool',
      viewerReasoning: 'Reasoning',
      viewerArgs: 'Arguments',
      viewerResult: 'Result',
      viewerImage: 'Image',
      viewerTodo: 'Todo',
      viewerTurn: 'Turn {n}',
      viewerStep: 'Step {n}',
      viewerTurnEnd: 'End of turn {n}',
      viewerStepEnd: 'End of step {n}',
      viewerRequest: 'Request context',
      viewerRequestHeader: 'Request config',
      viewerSeedEnd: 'End of seed history',
      viewerReasonCompleted: 'Completed',
      viewerReasonAborted: 'Aborted',
      viewerReasonBlocked: 'Blocked',
      viewerReasonError: 'Error',
      viewerReasonMaxTokens: 'Max tokens reached',
      viewerReasonInterrupted: 'Interrupted',
      viewerReasonUnknown: 'Unknown reason',
      viewerUsage: 'tokens',
      viewerFailure: 'Failed',
      viewerSkipped: 'Skipped',
      viewerImageMeta: '{w}×{h} · {media} · {bytes} B',
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
      + '.am-select{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}\n'
       + '.am-select:hover{background:var(--dsw-alias-interactive-bg-hover)}\n'
       + '.am-select:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}\n'
       + '.am-filter-chevron{flex:none}\n'
            + '.am-batch-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-module-platform)}\n'
       + '.am-batch-copy{display:flex;flex-direction:column;gap:2px;min-width:0}\n'
       + '.am-batch-title{font-size:13px;color:var(--dsw-alias-label-primary)}\n'
       + '.am-batch-hint{font-size:12px;color:var(--dsw-alias-label-tertiary)}\n'
       + '.am-batch-btn{height:32px;padding:0 14px;border:none;border-radius:16px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}\n'
       + '.am-batch-btn:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}\n'
       + '.am-batch-btn:disabled{opacity:.4;cursor:default}\n'
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
       + '.am-row-meta{display:flex;align-items:center;gap:10px;min-width:0;margin-top:3px}\n'
       + '.am-row-time{flex:0 0 auto;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}\n'
       + '.am-row-id-wrap{position:relative;display:inline-flex;min-width:0;max-width:100%}\n'
       + '.am-row-id{display:inline-flex;align-items:center;min-width:0;max-width:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-dimmed);font:inherit;font-family:var(--ds-font-family-code,monospace);font-size:11px;line-height:16px;cursor:pointer;direction:ltr;unicode-bidi:plaintext}\n'
       + '.am-row-id:hover{color:var(--dsw-alias-label-primary)}\n'
       + '.am-row-id:focus-visible{outline:none;border-radius:4px;box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent)}\n'
       + '.am-row-id-value-visible{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n'
       + '.am-copied{flex:0 0 auto;margin-left:6px;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:16px;white-space:nowrap;direction:ltr;unicode-bidi:plaintext}\n'
       + '.am-row-id-tooltip{position:absolute;left:0;top:calc(100% + 8px);z-index:902;width:max-content;max-width:min(560px,calc(100vw - 48px));padding:8px 12px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-bg-module-platform);box-shadow:var(--dsw-shadow-lv1);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,monospace);font-size:11px;line-height:16px;white-space:normal;overflow-wrap:anywhere;opacity:0;pointer-events:none;transform:translateY(-2px);transition:opacity 120ms ease,transform 120ms ease}\n'
       + '.am-row-id-wrap:hover .am-row-id-tooltip,.am-row-id:focus-visible + .am-row-id-tooltip{opacity:1;transform:translateY(0)}\n'
       + '.am-row-meta > .am-row-id-value-legacy,.am-row-meta > .am-copy-id,.am-row-meta > div.am-row-time{display:none}\n'

       + '.am-row-status{display:inline-flex;align-items:center;margin-left:8px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:11px;font-weight:500;vertical-align:middle}\n'
       + '.am-force-btn{height:28px;padding:0 10px;border:none;border-radius:14px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);cursor:pointer;font:inherit;font-size:12px;white-space:nowrap}\n'
       + '.am-force-btn:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground)}\n'
       + '.am-force-btn:disabled{opacity:.4;cursor:default}\n'
      + '\n'
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
      + '.am-delete-btn,.am-archive-confirm-btn,.am-force-confirm-btn{height:36px;padding:0 16px;border-radius:18px;border:none;background:var(--dsw-alias-state-error-primary);color:#fff;cursor:pointer;font-size:13px;font-family:inherit}\n'
      + '.am-delete-btn:hover:not(:disabled),.am-archive-confirm-btn:hover:not(:disabled),.am-force-confirm-btn:hover:not(:disabled){filter:brightness(.92)}\n'
      + '.am-cancel-btn:disabled,.am-delete-btn:disabled,.am-archive-confirm-btn:disabled,.am-force-confirm-btn:disabled{opacity:.4;cursor:default}\n'

       // --- read-only session content viewer (per-row "View" modal) ---
       + '.am-viewer-modal{width:min(760px,calc(100vw - 48px))}\n'
       + '.am-viewer-content{display:flex;flex-direction:column;gap:10px;max-height:min(72vh,640px);overflow-y:auto;padding-right:4px}\n'
       + '.am-viewer-state{margin:0;padding:28px 0;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}\n'
       + '.am-viewer-error{margin:0;padding:28px 0;text-align:center;font-size:13px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}\n'
       + '.am-viewer-meta{display:flex;flex-wrap:wrap;gap:4px 14px;padding:6px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);font-size:11px;color:var(--dsw-alias-label-tertiary);direction:ltr;unicode-bidi:plaintext}\n'
       + '.am-viewer-meta b{font-weight:500;color:var(--dsw-alias-label-secondary)}\n'
       + '.am-viewer-boundary{display:flex;align-items:center;gap:10px;padding:10px 0 2px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--dsw-alias-label-tertiary)}\n'
       + '.am-viewer-boundary:before,.am-viewer-boundary:after{content:"";flex:1 1 auto;height:1px;background:var(--dsw-alias-border-l2)}\n'
       + '.am-viewer-boundary-time{margin-left:auto;font-weight:400;text-transform:none;letter-spacing:0;color:var(--dsw-alias-label-quaternary,var(--dsw-alias-label-tertiary))}\n'
       + '.am-viewer-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2)}\n'
       + '.am-viewer-card-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}\n'
       + '.am-viewer-role{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500}\n'
       + '.am-viewer-time{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-quaternary,var(--dsw-alias-label-tertiary));white-space:nowrap}\n'
       + '.am-viewer-md{font-size:13px;line-height:1.65;color:var(--dsw-alias-label-primary);word-break:break-word}\n'
       + '.am-viewer-block{border-top:1px solid var(--dsw-alias-border-l2);margin-top:8px;padding-top:8px}\n'
       + '.am-viewer-block:first-child{border-top:none;margin-top:0;padding-top:0}\n'
       + '.am-viewer-reasoning{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}\n'
       + '.am-viewer-tool-name{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,monospace)}\n'
       + '.am-viewer-tool-callid{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code,monospace)}\n'
       + '.am-viewer-result-text{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-module-platform)}\n'
       + '.am-viewer-image{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--dsw-alias-label-secondary)}\n'
       + '.am-viewer-image-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n'
       + '.am-viewer-image-id{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code,monospace);direction:ltr;unicode-bidi:plaintext}\n'
       + '.am-viewer-todo{display:flex;flex-direction:column;gap:4px}\n'
       + '.am-viewer-todo-item{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}\n'
       + '.am-viewer-todo-item.am-done{color:var(--dsw-alias-label-tertiary)}\n'
       + '.am-viewer-todo-mark{flex:0 0 auto;margin-top:3px;width:8px;height:8px;border-radius:2px}\n'
       + '.am-viewer-todo-mark.am-pending{background:var(--dsw-alias-border-l3)}\n'
       + '.am-viewer-todo-mark.am-run{background:var(--dsw-alias-state-business-primary)}\n'
       + '.am-viewer-todo-mark.am-ok{background:var(--dsw-alias-state-success-primary)}\n'
       + '.am-viewer-request{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;font-size:12px}\n'
       + '.am-viewer-request dt{color:var(--dsw-alias-label-tertiary)}\n'
       + '.am-viewer-request dd{margin:0;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,monospace);word-break:break-word}\n'
       + '.am-viewer-disclosure{margin-top:8px}\n'

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

    function displaySessionId(id) {
       if (id.length <= 28) return id
       return id.slice(0, 12) + '\u2026' + id.slice(-12)
     }

     function fallbackCopy(text) {
       if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
       var input = document.createElement('textarea')
       input.value = text
       input.setAttribute('readonly', '')
       input.style.position = 'fixed'
       input.style.opacity = '0'
       document.body.appendChild(input)
       input.select()
       var copied = false
       try { copied = document.execCommand('copy') === true } catch {}
       input.remove()
       return copied
     }

     function copySessionId(id) {
       if (typeof navigator !== 'undefined' && navigator.clipboard
         && typeof navigator.clipboard.writeText === 'function') {
         return navigator.clipboard.writeText(id).then(function () { return true }, function () {
           return fallbackCopy(id)
         })
       }
       return Promise.resolve(fallbackCopy(id))
     }

     function projectOf(cwd) {
      if (!cwd) return t('uncategorized')
      var parts = String(cwd).replace(/\\/g, '/').split('/').filter(Boolean)
      return parts.length ? parts[parts.length - 1] : t('uncategorized')
    }

    /** Match the workspace browser's visible ungrouped bucket. */
    function visibleUngroupedIds(list, wsState) {
      if (!list || !wsState || wsState.baselinesReady !== true || !Array.isArray(list.ids)) return []
      var accounted = Object.create(null)
      var archived = Object.create(null)
      var items = wsState && Array.isArray(wsState.items) ? wsState.items : []
      var archivedIds = wsState && Array.isArray(wsState.archivedSessionIds)
        ? wsState.archivedSessionIds
        : []
      items.forEach(function (workspace) {
        var ids = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []
        ids.forEach(function (id) { accounted[String(id)] = true })
      })
      archivedIds.forEach(function (id) { archived[String(id)] = true })
      return list.ids.filter(function (id) {
        var sid = String(id)
        var summary = list.byId ? list.byId[sid] : undefined
        if (accounted[sid] || archived[sid] || !summary) return false
        if (summary.origin === 'subagent' || summary.blank === true) return false
        return true
      }).map(String)
    }

    /**
     * Pill selector with an anchored menu, matching the DSH settings surface's
     * language selector (primitives Menu, right-aligned, portal-fixed).
     */
    function FilterMenu(props) {
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var options = React.Children.toArray(props.children).map(function (option) {
        return { id: String(option.props.value), label: option.props.children }
      })
      var active = options.find(function (option) { return option.id === String(props.value) })
      return createElement(Menu, {
        open: open,
        items: options,
        selectedId: String(props.value),
        onSelect: function (id) {
          props.onChange({ target: { value: id } })
          setOpen(false)
        },
        onClose: function () { setOpen(false) },
        align: 'end',
        portal: true,
        anchor: createElement('button', {
          type: 'button',
          className: 'am-select',
          'aria-label': props['aria-label'],
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          onClick: function () { setOpen(!open) },
        }, active ? active.label : '', createElement(IconChevronDownOutline14, { className: 'am-filter-chevron' })),
      })
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

    // ------------------------- read-only session content viewer -------------------------
    /** Attempt JSON.parse; returns the parsed value or undefined. */
    function tryParseJson(raw) {
      if (typeof raw !== 'string' || raw.trim() === '') return undefined
      try {
        var value = JSON.parse(raw)
        return value !== null && typeof value === 'object' ? value : undefined
      } catch {
        return undefined
      }
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes)) return ''
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB'
      return (bytes / 1024 / 1024).toFixed(1) + ' MiB'
    }

    /** Localized turn-end reason text from the projected reason DTO. */
    function reasonText(reason) {
      if (!reason || typeof reason !== 'object') return t('viewerReasonUnknown')
      var label = t('viewerReason' + (typeof reason.kind === 'string' ? reason.kind[0].toUpperCase() + reason.kind.slice(1) : 'Unknown')) || t('viewerReasonUnknown')
      if (reason.kind === 'error' && reason.message) return label + ' — ' + reason.message
      if (reason.kind === 'aborted' && reason.causeKind) return label + ' (' + reason.causeKind + ')'
      return label
    }

    /** Controlled disclosure wrapper over the primitives DisclosureRow. */
    function Fold(props) {
      var state = React.useState(props.defaultOpen === true)
      var open = state[0]
      var setOpen = state[1]
      return createElement(DisclosureRow, {
        icon: createElement(IconChevronDownOutline14, { size: 14 }),
        title: props.title,
        open: open,
        expandable: true,
        onToggle: function () { setOpen(!open) },
        expandOnRowClick: true,
        previewChevron: true,
        className: 'am-viewer-disclosure',
        children: props.children,
      })
    }

    /** Render a tool-call's raw arguments as JSON when parseable, else as folded text. */
    function renderArgsBlock(key, label, rawArguments) {
      var parsed = tryParseJson(rawArguments)
      if (parsed !== undefined) {
        return createElement(JsonBlock, { key: key, label: label, payload: parsed })
      }
      return createElement(Fold, { key: key, title: label },
        createElement(MessageText, { text: String(rawArguments ?? '') }))
    }

    /** Render a tool-result's projected blocks: JSON when the payload parses, else folded text. */
    function renderResultBlocks(key, label, blocks) {
      var text = ''
      var onlyText = true
      ;(Array.isArray(blocks) ? blocks : []).forEach(function (block) {
        if (block && block.type === 'text' && typeof block.text === 'string') text += block.text
        else onlyText = false
      })
      var parsed = onlyText ? tryParseJson(text) : undefined
      if (!onlyText) {
        return createElement(Fold, { key: key, title: label },
          (Array.isArray(blocks) ? blocks : []).map(function (block, index) {
            return createElement(ContentBlockView, { key: String(index), block: block })
          }))
      }
      if (parsed !== undefined) {
        return createElement(JsonBlock, { key: key, label: label, payload: parsed })
      }
      return createElement(Fold, { key: key, title: label, defaultOpen: true },
        createElement('div', { className: 'am-viewer-result-text' }, text))
    }

    /** Render one projected content block. */
    function ContentBlockView(props) {
      var block = props.block
      if (!block || typeof block !== 'object') return null
      switch (block.type) {
        case 'text':
          return createElement('div', { className: 'am-viewer-block' },
            createElement('div', { className: 'am-viewer-md' },
              createElement(MarkdownText, { text: block.text || '' })))
        case 'reasoning':
          return createElement('div', { className: 'am-viewer-block' },
            createElement(Fold, { title: t('viewerReasoning') },
              createElement('div', { className: 'am-viewer-reasoning' }, block.text || '')))
        case 'image':
          return createElement('div', { className: 'am-viewer-block' },
            createElement('div', { className: 'am-viewer-image' },
              createElement('div', { className: 'am-viewer-image-line' },
                createElement('span', { className: 'am-viewer-role' }, t('viewerImage')),
                createElement('span', null, t('viewerImageMeta', {
                  w: Number(block.attachment && block.attachment.width) || '?',
                  h: Number(block.attachment && block.attachment.height) || '?',
                  media: (block.attachment && block.attachment.mediaType) || '?',
                  bytes: formatBytes(Number(block.attachment && block.attachment.bytes)),
                })),
              ),
              block.attachment && block.attachment.name
                ? createElement('span', { className: 'am-viewer-image-id' }, block.attachment.name)
                : null,
              block.attachment && block.attachment.attachmentId
                ? createElement('span', { className: 'am-viewer-image-id' }, block.attachment.attachmentId)
                : null,
            ))
        case 'tool-call':
          return createElement('div', { className: 'am-viewer-block' },
            createElement('div', { className: 'am-viewer-tool-name' }, block.name || ''),
            renderArgsBlock('args', t('viewerArgs'), block.arguments))
        case 'tool-result':
          return createElement('div', { className: 'am-viewer-block' },
            renderResultBlocks('result', t('viewerResult'), block.blocks))
        default:
          return null
      }
    }

    /** Render a message card (user/assistant) with its projected blocks. */
    function MessageCard(props) {
      var ev = props.event
      var data = ev.data || {}
      var blocks = Array.isArray(data.blocks) ? data.blocks : []
      return createElement('div', { className: 'am-viewer-card' },
        createElement('div', { className: 'am-viewer-card-head' },
          createElement('span', { className: 'am-viewer-role' }, props.role),
          data.usage && typeof data.usage === 'object'
            ? createElement('span', { className: 'am-viewer-tool-callid' },
                t('viewerUsage') + ': ' + (Number(data.usage.inputTokens) || 0) + ' / ' + (Number(data.usage.outputTokens) || 0))
            : null,
          createElement('span', { className: 'am-viewer-time' }, formatDate(ev.time)),
        ),
        blocks.length === 0
          ? createElement('p', { className: 'am-viewer-state' }, t('viewerEmpty'))
          : blocks.map(function (block, index) {
              return createElement(ContentBlockView, { key: String(index), block: block })
            }),
      )
    }

    /** Render the projected event log as ordered viewer rows. */
    function EventLogView(props) {
      var events = Array.isArray(props.data.events) ? props.data.events : []
      var rows = []
      events.forEach(function (ev) {
        if (!ev || typeof ev !== 'object' || ev.skipped === true) return
        var data = ev.data || {}
        switch (ev.type) {
          case 'turn/start':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-boundary' },
              createElement('span', null, t('viewerTurn', { n: data.turn })),
              createElement('span', { className: 'am-viewer-boundary-time' }, formatDate(ev.time))))
            break
          case 'turn/end':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-boundary' },
              createElement('span', null, t('viewerTurnEnd', { n: data.turn })),
              createElement('span', null, reasonText(data.reason)),
              createElement('span', { className: 'am-viewer-boundary-time' }, formatDate(ev.time))))
            break
          case 'step/start':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-boundary' },
              createElement('span', null, t('viewerStep', { n: data.step })),
              createElement('span', { className: 'am-viewer-boundary-time' }, formatDate(ev.time))))
            break
          case 'step/end':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-boundary' },
              createElement('span', null, t('viewerStepEnd', { n: data.step })),
              createElement('span', { className: 'am-viewer-boundary-time' }, formatDate(ev.time))))
            break
          case 'user/message':
            rows.push(createElement(MessageCard, { key: 'e' + ev.seq, event: ev, role: t('viewerUser') }))
            break
          case 'assistant/message':
            rows.push(createElement(MessageCard, { key: 'e' + ev.seq, event: ev, role: t('viewerAssistant') }))
            break
          case 'tool/call':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-card' },
              createElement('div', { className: 'am-viewer-card-head' },
                createElement('span', { className: 'am-viewer-role' }, t('viewerTool')),
                createElement('span', { className: 'am-viewer-tool-name' }, data.name || ''),
                data.callId ? createElement('span', { className: 'am-viewer-tool-callid' }, data.callId) : null,
                createElement('span', { className: 'am-viewer-time' }, formatDate(ev.time)),
              ),
              renderArgsBlock('args-' + ev.seq, t('viewerArgs'), data.arguments),
            ))
            break
          case 'tool/result':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-card' },
              createElement('div', { className: 'am-viewer-card-head' },
                createElement('span', { className: 'am-viewer-role' }, t('viewerResult')),
                data.isError === true ? createElement('span', { className: 'am-viewer-role' }, t('viewerFailure')) : null,
                data.callId ? createElement('span', { className: 'am-viewer-tool-callid' }, data.callId) : null,
                createElement('span', { className: 'am-viewer-time' }, formatDate(ev.time)),
              ),
              renderResultBlocks('result-' + ev.seq, t('viewerResult'), data.blocks),
            ))
            break
          case 'todo/write':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-card' },
              createElement('div', { className: 'am-viewer-card-head' },
                createElement('span', { className: 'am-viewer-role' }, t('viewerTodo')),
                createElement('span', { className: 'am-viewer-time' }, formatDate(ev.time)),
              ),
              createElement('div', { className: 'am-viewer-todo' },
                (Array.isArray(data.todos) ? data.todos : []).map(function (todo, index) {
                  var statusClass = todo.status === 'completed' ? 'am-ok'
                    : todo.status === 'in_progress' ? 'am-run' : 'am-pending'
                  return createElement('div', {
                    key: String(index),
                    className: 'am-viewer-todo-item' + (todo.status === 'completed' ? ' am-done' : ''),
                  },
                    createElement('span', { className: 'am-viewer-todo-mark ' + statusClass, 'aria-hidden': true }),
                    createElement('span', null, todo.content || ''),
                  )
                }),
              ),
            ))
            break
          case 'request/header':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-card' },
              createElement('div', { className: 'am-viewer-card-head' },
                createElement('span', { className: 'am-viewer-role' }, t('viewerRequestHeader')),
                createElement('span', { className: 'am-viewer-time' }, formatDate(ev.time)),
              ),
              createElement('dl', { className: 'am-viewer-request' },
                data.provider ? createElement(React.Fragment, null,
                  createElement('dt', null, 'provider'), createElement('dd', null, data.provider)) : null,
                data.model ? createElement(React.Fragment, null,
                  createElement('dt', null, 'model'), createElement('dd', null, data.model)) : null,
                data.reasoningEffort ? createElement(React.Fragment, null,
                  createElement('dt', null, 'reasoning'), createElement('dd', null, data.reasoningEffort)) : null,
                data.temperature !== undefined ? createElement(React.Fragment, null,
                  createElement('dt', null, 'temperature'), createElement('dd', null, String(data.temperature))) : null,
                data.maxTokens !== undefined ? createElement(React.Fragment, null,
                  createElement('dt', null, 'maxTokens'), createElement('dd', null, String(data.maxTokens))) : null,
              ),
            ))
            break
          case 'request/context':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-card' },
              createElement('div', { className: 'am-viewer-card-head' },
                createElement('span', { className: 'am-viewer-role' }, t('viewerRequest')),
                createElement('span', { className: 'am-viewer-time' }, formatDate(ev.time)),
              ),
              createElement('dl', { className: 'am-viewer-request' },
                data.provider ? createElement(React.Fragment, null,
                  createElement('dt', null, 'provider'), createElement('dd', null, data.provider)) : null,
                data.model ? createElement(React.Fragment, null,
                  createElement('dt', null, 'model'), createElement('dd', null, data.model)) : null,
                data.contextWindow !== undefined ? createElement(React.Fragment, null,
                  createElement('dt', null, 'contextWindow'), createElement('dd', null, String(data.contextWindow))) : null,
              ),
            ))
            break
          case 'session/end-seed':
            rows.push(createElement('div', { key: 'e' + ev.seq, className: 'am-viewer-boundary' },
              createElement('span', null, t('viewerSeedEnd')),
              createElement('span', { className: 'am-viewer-boundary-time' }, formatDate(ev.time))))
            break
          default:
            break
        }
      })
      return createElement('div', null, rows)
    }

    /** Read-only modal showing one archived session's full event content. */
    function ViewerModal(props) {
      var open = props.open === true
      var sessionId = props.sessionId
      var state = React.useState({ status: 'loading' })
      var viewer = state[0]
      var setViewer = state[1]
      var mountedRef = React.useRef(true)
      React.useEffect(function () {
        mountedRef.current = true
        if (!open || !sessionId) return undefined
        setViewer({ status: 'loading' })
        var cancelled = false
        fetch('/archive-manager/content', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId }),
        }).then(function (response) {
          return response.json().catch(function () { return {} }).then(function (result) {
            if (!response.ok) throw new Error(result.error || 'Request failed (' + response.status + ')')
            return result
          })
        }).then(function (result) {
          if (cancelled || !mountedRef.current) return
          var events = Array.isArray(result.events) ? result.events.filter(function (ev) { return ev && ev.skipped !== true }) : []
          setViewer({ status: 'ready', data: result, hasRows: events.length > 0 })
        }).catch(function (error) {
          if (cancelled || !mountedRef.current) return
          setViewer({ status: 'error', message: String(error && error.message ? error.message : error) })
        })
        return function () { cancelled = true }
      }, [open, sessionId])

      React.useEffect(function () {
        return function () { mountedRef.current = false }
      }, [])

      var body = null
      if (viewer.status === 'loading') {
        body = createElement('p', { className: 'am-viewer-state' }, t('viewerLoading'))
      } else if (viewer.status === 'error') {
        body = createElement('p', { className: 'am-viewer-error' },
          t('viewerError') + '\n' + String(viewer.message || ''))
      } else if (viewer.hasRows !== true) {
        body = createElement('p', { className: 'am-viewer-state' }, t('viewerEmpty'))
      } else {
        var meta = viewer.data && viewer.data.meta
        var metaItems = []
        if (meta) {
          if (meta.cwd) metaItems.push(createElement('span', { key: 'cwd' }, createElement('b', null, 'cwd'), ' ', meta.cwd))
          if (meta.parentSession) metaItems.push(createElement('span', { key: 'parent' }, createElement('b', null, 'parent'), ' ', meta.parentSession))
          if (meta.agentPreset) metaItems.push(createElement('span', { key: 'agent' }, createElement('b', null, 'agent'), ' ', meta.agentPreset))
          if (meta.delegationDepth !== undefined) metaItems.push(createElement('span', { key: 'depth' }, createElement('b', null, 'depth'), ' ', String(meta.delegationDepth)))
        }
        body = createElement(React.Fragment, null,
          metaItems.length > 0 ? createElement('div', { className: 'am-viewer-meta' }, metaItems) : null,
          createElement(EventLogView, { data: viewer.data }),
        )
      }

      return createElement(Modal, {
        open: open,
        onClose: props.onClose,
        title: props.title || t('viewerTitle'),
        closeLabel: t('viewerClose'),
        className: 'am-viewer-modal',
        contentClassName: 'am-viewer-content',
        children: body,
      })
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
      var copyTimerRef = React.useRef(null)
       var copiedState = React.useState(null)
       var copiedId = copiedState[0]
       var setCopiedId = copiedState[1]
       var seqRef = React.useRef(0)
      React.useEffect(function () {
        mountedRef.current = true
        return function () {
           mountedRef.current = false
           if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
         }
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
      var healthState = React.useState({})
       var health = healthState[0]
       var setHealth = healthState[1]
       var viewerState = React.useState(null)
       var viewerSessionId = viewerState[0]
       var setViewerSessionId = viewerState[1]
       var ungroupedIds = visibleUngroupedIds(list, wsState)

      var archivedIds = wsState ? wsState.archivedSessionIds || [] : []
      var healthKey = archivedIds.map(String).join(',')
       React.useEffect(function () {
         var ids = archivedIds.map(String)
         if (ids.length === 0) {
           setHealth({})
           return undefined
         }
         var cancelled = false
         fetch('/archive-manager/inspect', {
           method: 'POST',
           headers: { 'content-type': 'application/json' },
           body: JSON.stringify({ sessionIds: ids }),
         }).then(function (response) {
           return response.json().catch(function () { return {} }).then(function (result) {
             if (!response.ok) throw new Error(result.error || 'health check failed')
             return result
           })
         }).then(function (result) {
           if (cancelled) return
           var next = Object.create(null)
           ;(result.items || []).forEach(function (item) {
             next[String(item.id)] = item
           })
           setHealth(next)
         }).catch(function () {
           if (!cancelled) setError(tr('healthCheckFailed'))
         })
         return function () { cancelled = true }
       }, [healthKey])
       var rows = archivedIds.map(function (id) {
        var sid = String(id)
        var summary = list && list.byId ? list.byId[sid] : undefined
        return {
          id: sid,
          title: String(summary ? summary.displayTitle : sid),
          cwd: summary ? summary.cwd : undefined,
          project: projectOf(summary ? summary.cwd : undefined),
          updatedAt: summary ? summary.updatedAt : undefined,
           health: health[sid],
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
        if (q && row.title.toLowerCase().indexOf(q) === -1
           && row.id.toLowerCase().indexOf(q) === -1) return false
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
        if (res && res.error && !(Array.isArray(res.failed) && res.failed.length)) parts.push(toText(res.error))
        return parts.join(' ')
      }

      /** Replace known server-side failure messages with friendly localized copy. */
      function friendlyError(text) {
        return String(text || '').replace(
          /session '[^']*' is currently running;?\s*stop it before deleting/gi,
          tr('error.running'),
        )
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
            setError(tr('batchFailed', { failed: res.failed.length }) + ' ' + friendlyError(describeFailure(res)))
          }
          refreshSessions()
          return true
        }).catch(function (e) {
          if (seq !== seqRef.current || !mountedRef.current) return false
          setBusy(false)
          setError(friendlyError(String(e && e.message ? e.message : e)))
          return false
        })
      }

      function copyRowId(id) {
         copySessionId(id).then(function (copied) {
           if (!copied || !mountedRef.current) return
           if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
           setCopiedId(id)
           copyTimerRef.current = setTimeout(function () {
             if (mountedRef.current) setCopiedId(null)
             copyTimerRef.current = null
           }, 600)
         })
       }

       function unarchiveOne(row) { return act('/archive-manager/unarchive', { sessionId: row.id, confirm: true }) }
      function requestConfirm(kind, action) { setPendingConfirm({ kind: kind, action: action }) }
      function requestDelete(action) { requestConfirm('delete', action) }
      function requestArchive(action) { requestConfirm('archive', action) }
      function confirmPending() {
        var pending = pendingConfirm
        setPendingConfirm(null)
        if (pending && typeof pending.action === 'function') pending.action()
      }
      function cancelPending() { setPendingConfirm(null) }
      function deleteOne(row) { requestDelete(function () { act('/archive-manager/delete', { sessionId: row.id, confirm: true }) }) }
       function forceDeleteOne(row) {
         requestConfirm('force', function () {
           act('/archive-manager/force-delete', { sessionIds: [row.id], confirm: true })
         })
       }
      function deleteAll() { requestDelete(function () { act('/archive-manager/delete-all', { confirm: true }) }) }
      function deleteProject(group) {
        requestDelete(function () { act('/archive-manager/delete-project', { cwd: group.key, confirm: true }) })
      }
      function archiveUngroupedWithRuntime(ids) {
        var seq = ++seqRef.current
        setBusy(true)
        setError(null)
        return Promise.all(ids.map(function (id) {
          return Promise.resolve().then(function () { return workspacesService.archiveSession(id) }).then(
            function () { return null },
            function (error) { return toText(error && error.message ? error.message : error) },
          )
        })).then(function (failures) {
          if (seq !== seqRef.current || !mountedRef.current) return false
          setBusy(false)
          var failed = failures.filter(function (message) { return message !== null })
          if (failed.length) setError(tr('batchFailed', { failed: failed.length }) + ' ' + failed.join('; '))
          refreshSessions()
          return failed.length === 0
        })
      }
      function archiveUngrouped() {
        if (ungroupedIds.length === 0) return
        requestArchive(function () {
          if (workspacesService && typeof workspacesService.archiveSession === 'function') {
            return archiveUngroupedWithRuntime(ungroupedIds)
          }
          return act('/archive-manager/archive-ungrouped', { sessionIds: ungroupedIds, confirm: true })
        })
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
             disabled: props.disabled === true,
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
            }, tr(props.labelKey || 'deleteProjectContent')),
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
          createElement(FilterMenu, {
            className: 'am-select',
            value: sortBy,
            onChange: function (e) { setSortBy(e.target.value) },
            'aria-label': tr('sortBy'),
          },
            createElement('option', { value: 'updated' }, tr('sortUpdated')),
            createElement('option', { value: 'alpha' }, tr('sortAlpha')),
          ),
          createElement(FilterMenu, {
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
                            createElement('div', { className: 'am-row-title' },
                               row.title,
                               row.health && row.health.status !== 'ok'
                                 ? createElement('span', { className: 'am-row-status' }, tr(row.health.status))
                                 : null,
                             ),
                            createElement('div', { className: 'am-row-meta' },
                               row.updatedAt ? createElement('span', { className: 'am-row-time' },
                                 formatDate(row.updatedAt)) : null,
                               createElement('span', { className: 'am-row-id-wrap' },
                                 createElement('button', {
                                   type: 'button',
                                   className: 'am-row-id',
                                   'aria-label': tr('copyId'),
                                   onClick: function () { copyRowId(row.id) },
                                 },
                                   createElement('span', { className: 'am-row-id-value-visible' }, displaySessionId(row.id)),
                                   copiedId === row.id
                                     ? createElement('span', { className: 'am-copied' }, tr('copied'))
                                     : null,
                                 ),
                                 createElement('span', { className: 'am-row-id-tooltip', role: 'tooltip' }, row.id),
                               ),
                               ),
                          ),
                          createElement('button', {
                            type: 'button',
                            className: row.health && row.health.status === 'corrupt' ? 'am-force-btn' : 'am-icon-btn',
                            'aria-label': tr(row.health && row.health.status === 'corrupt' ? 'forceDelete' : 'delete'),
                            onClick: function () { row.health && row.health.status === 'corrupt' ? forceDeleteOne(row) : deleteOne(row) },
                            disabled: busy,
                          }, row.health && row.health.status === 'corrupt' ? tr('forceDelete') : '\u2715'),
                          createElement('button', {
                            type: 'button',
                            className: 'am-btn',
                            onClick: function () { unarchiveOne(row) },
                            disabled: busy,
                          }, tr('unarchive')),
                          createElement('button', {
                            type: 'button',
                            className: 'am-btn',
                            onClick: function () { setViewerSessionId(row.id) },
                          }, tr('view')),
                        )
                      }),
                    ),
                  )
                }),
              ),
        ungroupedIds.length > 0 ? createElement('div', { className: 'am-batch-bar' },
          createElement('div', { className: 'am-batch-copy' },
            createElement('span', { className: 'am-batch-title' }, tr('archiveUngroupedTitle', { count: ungroupedIds.length })),
            createElement('span', { className: 'am-batch-hint' }, tr('archiveUngroupedHint')),
          ),
          createElement('button', {
            type: 'button',
            className: 'am-batch-btn',
            onClick: archiveUngrouped,
            disabled: busy,
          }, tr('archive')),
        ) : null,
        pendingConfirm ? createElement(
          'div',
          { className: 'am-mask', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr(pendingConfirm.kind === 'force' ? 'forceDeleteTitle' : pendingConfirm.kind === 'archive' ? 'confirmArchiveTitle' : 'confirmDeleteTitle') },
          createElement(
            'div',
            { className: 'am-modal' },
            createElement('h2', { className: 'am-modal-title' }, tr(pendingConfirm.kind === 'force' ? 'forceDeleteTitle' : pendingConfirm.kind === 'archive' ? 'confirmArchiveTitle' : 'confirmDeleteTitle')),
            createElement('p', { className: 'am-modal-body' }, tr(pendingConfirm.kind === 'force' ? 'forceDeleteBody' : pendingConfirm.kind === 'archive' ? 'confirmArchiveBody' : 'confirmDeleteBody',
               pendingConfirm.kind === 'archive' ? { count: ungroupedIds.length } : undefined)),
            createElement('div', { className: 'am-modal-actions' },
              createElement('button', {
                type: 'button',
                className: 'am-cancel-btn',
                onClick: cancelPending,
                disabled: busy,
              }, tr('cancel')),
              createElement('button', {
                type: 'button',
                className: pendingConfirm.kind === 'force' ? 'am-force-confirm-btn' : pendingConfirm.kind === 'archive' ? 'am-archive-confirm-btn' : 'am-delete-btn',
                onClick: confirmPending,
                disabled: busy,
              }, tr(pendingConfirm.kind === 'force' ? 'forceDeleteButton' : pendingConfirm.kind === 'archive' ? 'archive' : 'delete')),
            ),
          ),
        ) : null,
        viewerSessionId ? createElement(ViewerModal, {
          open: true,
          sessionId: viewerSessionId,
          onClose: function () { setViewerSessionId(null) },
        }) : null,
      )
    }

    // ------------------------- plugin wiring -------------------------
    function apply(ctx) {
      ctx.effect(function () {
        injectStyles()
        return removeStyles
      }, 'dsh-archive-manager: stylesheet')

      var sessions = ctx.get('sessions')
      workspacesService = ctx.get('workspaces')
      ctx.effect(function () {
        return function () { workspacesService = undefined }
      }, 'dsh-archive-manager: workspace service detach')
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