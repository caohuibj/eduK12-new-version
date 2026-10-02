# Huisurvey Mini Program v2（开发中）

这是独立重建的客户端。历史 ../miniprogram 保留参考且不受支持。

1. 运行 `npm run verify`（Node 24.21.0，无外部 npm 依赖）。
2. 将 core/config/environment.js 设置为**隔离验收后端**的 HTTPS origin；默认 origin 只作配置示例，请勿用真实账号写生产数据进行测试。
3. 微信开发者工具导入本目录。当前为 touristappid；使用真实测试 AppID 时在 project.private.config.json 配置并在控制台设置合法 request domain。最低要求异步 encrypted storage；不支持时拒绝持久化会话。
4. 四角色 fixture smoke 覆盖真实页面逻辑，但真实服务、微信 DevTools、iOS/Android 全流程、cookie/CSRF 往返仍需单独验收。

统一 request 层位于 core/api；页面经 domain/workspace service 访问 Backend。/auth/me.mobile 为版本化导航发现，不取代对象级授权；旧 backend 缺字段时明确 capabilityMismatch。

文档：../../docs/miniprogram-v2/implementation-status.md 与 parent-authorization-proposal.md。

微信官方 API 证据： https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts （wx.request cookies；wx.setStorage/getStorage encrypt，自 2.21.3 支持异步加密）。加密本地保存不意味着浏览器 HttpOnly 的脚本隔离。
