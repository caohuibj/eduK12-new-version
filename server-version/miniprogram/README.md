# 历史微信小程序：当前 release 不支持

生产客户端支持范围为新版 Web。此目录仅保留历史源码供追溯，不属于当前 CI、Docker 构建或生产部署依赖。

此客户端仍依赖 Bearer token、增量作答、旧上传响应以及 raw WebSocket 客户端身份；当前 backend 使用 HttpOnly session cookie / CSRF、FINAL-only 提交、新 Asset 能力与 Socket.IO server-bound identity。现有小程序不能作为完整受支持客户端发布。

课程、作业和打卡也继承旧认证契约。不得为了恢复此客户端重新开放旧认证或禁写 API。外部已发布小程序的下架/提示需要运营核实。

生产部署唯一入口：[DEPLOYMENT-CHECKLIST](../DEPLOYMENT-CHECKLIST.md)。恢复支持需要独立适配与端到端验收。
