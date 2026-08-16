# 安全说明

## 路由安全

本插件注册的 `/archive-manager/*` 路由均为 `POST`，并做以下校验：

- **Content-Type 强制**：请求必须携带 `application/json`，否则拒绝（`415`）——无 JS 预检的 `text/plain` 简单请求无法触发任何路由；
- **同源校验**：请求的 `Origin`（无则回退 `Referer`）必须与当前主机一致，否则拒绝（`403`）；
- **二次确认**：所有破坏性路由（`unarchive`、`delete`、`delete-all`、`delete-project`、`archive-ungrouped`、`force-delete`）必须携带 `confirm: true`；
- **入参校验**：`sessionId` / `sessionIds` / `cwd` 均做类型与内容校验，非法值直接拒绝。

## 删除边界

- 「强制删除」（`force-delete`）会**跳过会话日志解析**，仅针对已归档且日志损坏或缺失的会话使用；
- 强制删除仅移除该会话自己的 JSONL 存储目录与归档/工作区记账，**不会触碰其他会话或项目目录**；
- 会话 ID 在参与文件系统路径前经过安全校验（拒绝路径分隔符与 `.` / `..`），目录定位同时匹配原始 ID 与其后端编码形式，删除前以 `realpath` 断言目标仍在会话根目录内（防符号链接逃逸）。

## 报告漏洞

发现安全问题请通过 [GitHub Issues](https://github.com/zxsctxx/dsh-archive-manager/issues) 报告（公开仓库；若涉及敏感内容请先私信维护者）。