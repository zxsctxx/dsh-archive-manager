# DSH Archive Manager

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web GUI 提供完整的已归档会话管理视图：恢复与永久删除。

按 [huahai0202/dsh-better-archive](https://github.com/huahai0202/dsh-better-archive) 的架构实现（Host HTTP 路由 + `settings.section` 设置页模式），并在此基础上补强：

- **双持久化后端**：JSONL（默认）与 SQLite（`dsh-session-persistence-sqlite`）都能永久删除；
- **批量删除健壮性**：逐会话失败隔离，坏日志 / 运行中的会话不会阻塞整批操作，并逐条回报失败原因；
- **运行中会话保护**：删除请求遇到正在运行的会话时明确拒绝（不再强行拆解 Agent）；
- **路由独立命名空间**：使用 `/archive-manager/*`，与上游 `dsh-better-archive` 的 `/archived/*` 互不冲突。

## 界面

在 DSH 侧边栏底部「设置」面板中出现「已归档」页面：

- 按项目分组展示已归档会话；
- 支持关键词搜索、按更新时间 / 名称排序、按项目筛选；
- 一键「恢复」会话（立即回到正常会话列表）；
- 「删除」单个会话、「删除此项目全部归档」或「清空全部归档」，均带二次确认；
- 删除失败（运行中 / 日志损坏 / 存储故障）逐条列出原因，其余会话不受影响；
- 文案跟随 DSH 语言设置，中英文切换无需刷新。

## 安装

需要 Node.js 22.19+ 和 pnpm。

```sh
dsh plugin --profile web add <path-to-this-checkout>
```

安装完成后重启 `dsh web`。插件会自动加入该 profile 的 `dsh.profile.bundles`；若未自动加入，请在该数组中添加 `"dsh-archive-manager"`，然后重启 DSH Web。

## 开发接口

| 路由 | 方法 | 用途 |
| --- | --- | --- |
| `/archive-manager/unarchive` | `POST` | 取消归档一个会话 |
| `/archive-manager/delete` | `POST` | 永久删除一个归档会话 |
| `/archive-manager/delete-project` | `POST` | 删除一个项目的全部归档会话（`confirm: true`） |
| `/archive-manager/delete-all` | `POST` | 清空全部归档会话（`confirm: true`） |

批量删除响应：`{ archived, deleted, failed: [{ id, error }], warnings: [...] }` —— 已删计数、逐条失败列表、记账性警告一并在一次响应中返回。

## 删除行为与后端支持

永久删除只作用于已归档会话。针对两种持久化后端分派：

| 后端 | 存储 | 删除方式 |
| --- | --- | --- |
| JSONL（默认） | 每会话一个目录 | 删除该会话专属目录 |
| SQLite | 单库文件（`sessions` + `events` 表） | 在库文件中删除该会话及其事件行 |

- JSONL：内容寻址附件由 DSH 独立管理，不随会话记录删除。
- SQLite：直接从后端配置的数据库路径打开并以事务删除；事件行先于会话行删除，不依赖外键开关。
- 其他持久化后端不提供删除能力时，返回明确的「不支持」错误而非静默失败。

## 目录

```text
dsh-archive-manager/
├── lib/
│   ├── index.js        # DSH Host 路由与会话删除（JSONL + SQLite）
│   └── client.js       # 「已归档」设置页（__ModuleLoader__ 手写 bundle）
├── cordis.patch.yml    # Host 挂载配置
└── package.json        # 插件声明（dsh.client + peerDeps）
```

## 本地开发

```sh
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
```

修改后重启 `dsh web` 加载最新代码。

## License

[MIT](./LICENSE)