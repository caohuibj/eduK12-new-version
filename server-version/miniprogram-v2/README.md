# Huisurvey Mini Program v2

独立重建的四角色客户端，目标目录为本目录；历史 ../miniprogram 保留参考且不受支持。当前已实现范围和发布缺口见 [上线前审查](../../docs/miniprogram-v2/prelaunch-review-20261004.md) 和 [发布执行清单](../../docs/miniprogram-v2/release-runbook.md)。

1. 使用 Node 24.21.0 执行 `npm run verify` 和 `node scripts/feature-inventory.cjs --check`（没有外部 npm 依赖）。
2. 在 core/config/environment.js 填写真实的隔离 develop/trial HTTPS origin；两者可共用验收服务，不能使用 release 生产地址。开发/体验版本未配置时明确阻止网络初始化，不再默认连接生产。
3. 在 project.config.json 设置真实 AppID；当前 touristappid 只是未完成配置。保持 URL 校验开启，在微信后台配置实际 request/uploadFile/downloadFile 域名和 Web 适配所需的业务域名、隐私保护指引。私有开发工具配置不入包；密码/AppSecret 不进入客户端。
4. 执行 `npm run release:check`，配置通过后才会运行全部检查；当前会明确报告 AppID、develop、trial 三个阻塞。
5. 微信开发者工具导入本目录，完成实际编译和体验版 iOS/Android 全流程、弱网、前后台、选图及双设备课堂验收后，再提交审核发布。Node 测试与源码资源体积不能替代微信编译和真机证据。

统一 request 层位于 core/api；页面经 domain/workspace service 访问 Backend。/auth/me.mobile 为版本化导航发现，不取代对象级授权；旧 backend 缺字段时明确 capabilityMismatch。图片选择统一经 core/media 与原生隐私授权组件；加密本地存储不可用时拒绝持久化会话，不降级明文。

家长仍需要有效关联、学生对精确内容的同意、有权负责人逐份授权和当前披露上限。服务端三个功能 flag 的代码默认值为 false；实际环境配置需单独核实。本轮没有改变生产开关或报告授权。家长实施见 [parent-implementation.md](../../docs/miniprogram-v2/parent-implementation.md)。

复杂测评等 Web 适配使用固定同源路径，网页登录独立；当前没有 SSO。原生日常业务、共享课堂、FINAL Runtime、发布链及未对等项见 [implementation-status.md](../../docs/miniprogram-v2/implementation-status.md)，历史阶段验收记录保留当时状态。

API 依据：[微信官方 API 类型与文档说明](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)。异步加密存储不提供浏览器 HttpOnly 的脚本隔离。
