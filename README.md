# DSH Archive Manager

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web GUI 提供完整的已归档会话管理视图：恢复与永久删除。

按 [huahai0202/dsh-better-archive](https://github.com/huahai0202/dsh-better-archive) 的架构实现（Host HTTP 路由 + `settings.section` 设置页模式），并在此基础上补强：

- **JSONL 持久化删除**：DSH 官方默认 JSONL 后端（每会话一个目录）可永久删除；其他后端返回明确的「不支持」错误；
- **批量删除健壮性**：逐会话失败隔离，坏日志 / 运行中的会话不会阻塞整批操作，并逐条回报失败原因；
- **运行中会话保护**：删除请求遇到正在运行的会话时明确拒绝（不再强行拆解 Agent）；
- **路由独立命名空间**：使用 `/archive-manager/*`，与上游 `dsh-better-archive` 的 `/archived/*` 互不冲突。

## 界面

在 DSH 侧边栏底部「设置」面板中出现「已归档」页面：

- 按项目分组展示已归档会话；
- 支持关键词搜索、按更新时间 / 名称排序、按项目筛选；
- 一键「恢复」会话（立即回到正常会话列表）；
- 「删除」单个会话、「删除此项目全部归档」或「清空全部归档」，均带二次确认；
- 页面底部仅在存在未分组会话时显示批量归档操作栏，归档前二次确认；
- 删除失败（运行中 / 日志损坏 / 存储故障）逐条列出原因，其余会话不受影响；
- 支持「查看」会话完整内容：用户消息、助手回复、思考过程、工具调用与结果、Todo、请求信息和附件元数据；
- 会话内容查看为只读，不会修改原始日志；
- 文案跟随 DSH 语言设置，中英文切换无需刷新。

## 安装

需要 [DSH](https://github.com/deepseek-ai/deepseek-harness)（Node.js 22.19+ 与 pnpm）与 `dsh` CLI。

```sh
dsh plugin --profile web add <path-to-this-checkout>
```

安装完成后重启 `dsh web`（客户端 bundle 有缓存，修改后也需重启加载）。

从源码运行：

```sh
pnpm install        # 安装依赖
dsh plugin --profile web add .   # 或使用本仓库路径
dsh web
```

> DSH 插件依赖声明见 `package.json` 的 `peerDependencies`（`@deepseek-ai/dsh-client-*` 0.1.0-rc.6 系列、react 18 与 cordis 4）；其他 DSH 版本可能不兼容。

## 开发接口

| 路由 | 方法 | 用途 |
| --- | --- | --- |
| `/archive-manager/unarchive` | `POST` | 取消归档一个会话（`confirm: true`） |
| `/archive-manager/delete` | `POST` | 永久删除一个归档会话（`confirm: true`） |
| `/archive-manager/delete-project` | `POST` | 删除一个项目的全部归档会话（`confirm: true`） |
| `/archive-manager/delete-all` | `POST` | 清空全部归档会话（`confirm: true`） |
| `/archive-manager/archive-ungrouped` | `POST` | 归档当前“未分组”分组中的会话（`sessionIds` + `confirm: true`） |
| `/archive-manager/inspect` | `POST` | 检查归档会话日志健康状态（`sessionIds`），区分正常 / 损坏 / 记录缺失 |
| `/archive-manager/content` | `POST` | 读取一个已归档会话的完整事件内容（`sessionId`，只读） |
| `/archive-manager/force-delete` | `POST` | 强制删除日志损坏或缺失的归档会话（`sessionIds` + `confirm: true`），跳过日志解析 |

批量删除响应：`{ archived, deleted, failed: [{ id, error }], warnings: [...] }` —— 已删计数、逐条失败列表、记账性警告一并在一次响应中返回。

## 会话内容查看

`POST /archive-manager/content` 接收 `{ sessionId }`，返回指定已归档会话的只读事件投影。界面展示用户消息、助手回复、思考过程、工具调用与结果、Todo、请求配置、Turn / Step 边界及图片附件元数据。

Host 端通过 DSH 官方 `sessionPersistence.inspect()` 读取完整日志，并逐事件构造 JSON-safe DTO：

- 不返回 system prompt、工具 schema 或原始会话文件路径；
- 图片只返回 `attachmentId`、媒体类型、尺寸和字节数等元数据，不读取原始字节；
- token 级 `assistant/chunk` 不单独展示，使用已组装的助手消息避免重复；
- 仅允许读取当前已归档的 `sessionId`，不会修改会话或日志。

## 删除行为与后端支持

永久删除只作用于已归档会话。当前支持 DSH 官方 JSONL 持久化后端：

- JSONL（默认，每会话一个目录）：删除该会话专属目录；内容寻址附件由 DSH 独立管理，不随会话记录删除。
- 其他持久化后端（如 SQLite 变体）在官方提供可验证的删除能力前，一律返回明确「不支持」错误而非猜测存储布局。

## 请求安全

- 所有 `/archive-manager/*` 路由要求 `POST` + `Content-Type: application/json`（无 JS 预检的简单请求无法触发）；
- 所有破坏性路由（含 `unarchive` / `delete`）要求 `confirm: true`；
- 同源校验：请求 `Origin`（无则回退 `Referer`）必须与当前主机一致。

## 损坏会话强制删除

- 页面会对每个归档会话调用 `/archive-manager/inspect` 做健康检查；
- 日志损坏或记录缺失的会话显示红色状态徽章，删除按钮变为「强制删除」；
- 强制删除跳过日志解析与序号校验，直接移除存储（JSONL 会话目录），并清理归档记录与工作区关联；
- 损坏会话的「恢复」仍保持禁用，避免把坏日志重新带回会话列表。

## 目录

```text
dsh-archive-manager/
├── lib/
│   ├── index.js        # DSH Host 路由、会话读取与删除（JSONL + SQLite）
│   └── client.js       # 「已归档」设置页与内容查看 Modal（__ModuleLoader__ 手写 bundle）
├── cordis.patch.yml    # Host 挂载配置
└── package.json        # 插件声明（dsh.client + peerDeps）
```

## 本地开发

```sh
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
```

客户端界面修改在开发热更新正常运行时无需重启，必要时刷新页面即可；Host 路由或会话读取逻辑修改后需要重启已有的 `dsh web` 进程。

## License

[MIT](./LICENSE)