# Huisurvey 小程序 v2 实施状态

基线：main@1ff0e8ef（#221 之后）。新版位于 server-version/miniprogram-v2，旧 server-version/miniprogram 已由主线标为 unsupported，保留参考，不复活其契约。新版使用独立 touristappid 开发配置；发布 AppID/备案域名/合法 request domain 必须在微信控制台确认。

## 执行中的低风险调整

- 保留旧源码原位置，增加独立 v2 项目；避免移动现有参考文件或误切已发布小程序。
- 当前 backend capabilities 是运行时特性开关，不是角色/资源授权。/auth/me 增加版本化 mobile discovery 字段，后端从当前数据库 user.role 生成导航能力；所有 API 仍走原 resource authorization。Organization allowedActions 单独读取，不从 ADMIN 角色推导。
- bootstrap 使用 /auth/me 与 /capabilities 并行（2 个 core requests）；首次 mutation 才请求 /auth/csrf（最多第 3 个）。首页 student/teacher/admin 各 2 个 business requests、parent 开关关闭时1个、开启后2个并行；不逐课程拼任务。
- 注册仅使用现有 /auth/student-register 与 /auth/teacher-register；不复活返回 410 的 /auth/register，也不增加家长自助注册。
- 扫码/Deep Link 先校验 origin、输入、类型和标识。course 由后端授权后打开详情；其他类型只识别并明确未开放，不伪造 resource publication 或运行权限。
- 静态检测按精确 retired mutation 契约与 transport 使用位置检查，不能按 /complete 后缀禁用仍合法的接口。
- 原生 cookie jar 仅保存 session/csrf allowlist，同一 origin，微信异步 encrypted storage；不明文降级。native JavaScript 必须处理 session cookie，不能声称具有浏览器 HttpOnly 隔离；需要微信真机验证与发布前安全验收。
- 状态、导航、共享 services 与视觉 primitive 集中实现；页面不发裸 request、不自行 role/capability 判权、不计分。

## 阶段边界

| 项目 | 当前实现 | 尚需验证/实施 |
|---|---|---|
| PR1 地基 | core/session/router、设计 primitive、四角色真实数据首页、course entry adapter | 微信开发者工具编译；微信设备认证 smoke（本机真实 HTTP 四角色登录已验证）；其他 entry resource adapters |
| PR2 能力对等 | 共享 tasks/courses/assessment inbox/organization/user 只读列表，课程/组织/用户详情基础 | 完整作业/打卡/发布/批量/课堂/内容管理；动作权限；家长披露审批及 Web 接入 |
| PR3 Runtime/报告 | 不开放作答；家长报告读取/撤回基础 renderer 已实现但缺正式 PARENT 内容 | FINAL_ONLY shell/renderer/recovery、canonical report adapters、scientific timing |
| 家长孩子与报告 | 关联/学生确认/解绑、exact consent/grant、孩子概况及原生展示基础已实现；默认关闭 | 正式 PARENT 内容、source 与产品闭环、设备验收，见 parent-implementation.md |

已增加小程序请求层连接真实本机 API 的 Cookie/CSRF 四角色与家长关联测试；测试 adapter 仍不等于微信编译/真机验收，合成报告源不等于正式报告包兼容。开发 PR 必须保持 Draft；未经完整 gates、真机验收不能宣称发布可用。

## 请求预算及风险

客户端固定首页请求数不证明 backend 每个列表无 N+1。现有 courses list 会逐课程 resolve signed cover assets；若扩大视图内容，应单独量测后端 DB/签名成本。my-assessments 无客户端分页且可能 truncated，新端保留 truncated 提示，不称完整历史。

Cognitive 默认不启用原生 task；是否使用 Web Runtime 必须先验证 timing 及认证/公开 capability 的安全移交，不能直接拼含 session 的 web-view URL。真机/域名配置属于后续发布门禁，不能由 Node smoke 替代。
