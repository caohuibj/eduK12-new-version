# PR1 CI 修订与本地验收（2026-09-22）

## 基线及远程失败证据

PR #160，远程 HEAD b1ba439297c78304fe47461080ba37d5eabbcfac。
本轮按要求只修改本地分支，不推送、修改标签、提交 review 或调用 workflow rerun。

- CI run 35721953416 / browser job 106731273672：
  首次访问 /student/login 时等待 domcontentloaded 30 秒超时。
- Situational Video run 35721953411：
  FE-11 视频故障验收在同一登录导航处超时，视频业务验收尚未开始。
- 两份下载的前端日志都显示 Vite 已监听 5173，没有编译异常栈；
  后端已 ready。原就绪条件仅检查首页 HTTP 200，不能证明 JS 已完成加载。
  日志没有网络时间线，不能据此断言是某个具体模块、CPU 或网络造成超时。
- Scale boundary 的初次失败是分类问题。上一轮已添加平台变更标签，
  后续 run 35723854567 已成功；本轮不改变标签或绕过边界。
- merge gate 因 browser 失败、docker 被跳过而失败，是正确的依赖传递，
  不修改合并门禁，也不把 skipped 当作通过。

## 修订

1. 两个失败的浏览器工作流先构建前端，再启动 Vite preview。
   由预构建 JS/CSS 提供页面，去除开发服务器首屏按需转换带来的变量。
   这是每个原有浏览器 job 内增加一次构建，不增加 workflow/job 数量。
2. preview 明确复用 API/uploads 代理，固定端口并启用 strictPort。
   前端进程提前退出会阻止启动步骤通过；HTTP 探针有单次超时上限。
   E2E_BACKEND_URL 只用于本地专用后端端口，CI 默认仍使用隔离后端 3000。
3. 增加 Chromium 就绪检查：实际渲染学生、教师账号和管理员登录控件，
   拒绝 Vite 开发客户端，检查 CSRF API 代理合同。
   失败保留截图、页面异常名称、失败请求路径和未完成请求路径；
   不记录 cookie、header、响应正文或 URL query 凭据。
4. 登录助手将调用方 timeout 传递给导航和输入控件。保留真实登录及
   cookie session 校验，不以 API 登录替代浏览器操作，不重试业务断言。
5. 问卷列表和编制器使用现有 React.lazy/Suspense 路由机制，
   不再同步加入所有登录页面的初始依赖。权限及路由保持原契约。
6. 本地重跑发现原媒体计数断言会把 /assets/*.js、CSS 误算为测评媒体：
   现在仅统计 /api/ 下的 /assets/ GET。Bundle 和 branching 共用该判定。
   仍断言缺少恢复凭据时零媒体 API 请求；补充正反例防止削弱授权检查。
7. 自托管 runner 在本次浏览器 job 开始时清除该 job 的旧截图、旧日志、
   PID 文件及 PR5 场景/恢复证据，防止失败运行上传上一轮成功产物。
8. 新助手回归测试接入既有前端 pretypecheck，新增 preflight 语法检查；
   视频工作流的路径过滤包含它依赖的公共助手和 Vite 配置。

## 本地验收

使用专用 PostgreSQL14 数据库 q1_ci_fix、专用 Redis 和合成身份。
浏览器端口 5141、后端 3041，未操作其他运行中的应用服务。
验证的是本修订工作树；旧脚本中的 candidate 字段仍记提交前的 b1ba439，
不能将该字段单独当作远程新提交已经通过的证明。

| 项目 | 结果 |
| --- | --- |
| 前端 typecheck、生产构建 | 通过，构建启用 Cognitive |
| 前端全量测试 | 136 文件，518 用例通过 |
| 前端 lint | 0 error；既有 92 warning |
| 后端构建 | 通过 |
| 登录助手及媒体 URL 合同 | 3 用例通过 |
| 两个工作流 YAML 与其中所有 shell 步骤语法 | 通过 |
| Chromium 就绪检查 | 三种登录页面及 CSRF 代理通过 |
| 就绪检查失败路径 | 不可达前端被拒绝，生成 FAIL JSON 和诊断截图 |
| FE-11 视频能力故障/恢复 | 通过 |
| Situational Video 完整验收 | standalone、登录嵌入、匿名嵌入、恢复凭据和单次 FINAL 全部通过 |
| Situational Bundle/static visual | 登录、匿名、图片/漫画、恢复、FINAL、冻结身份、canonical 结果及无凭据拦截通过 |
| FE-11 存储拒绝/重复标签页 | 通过；2 次 HTTP FINAL 对应 1 个逻辑 submission |
| RA-02 四角色关系页面 | 通过（既有前端 route-mock 验收） |
| PR5 Organization 跨角色 | 真实浏览器及后端通过 |
| PR5 学校、家长、咨询场景及 legacy Course | 真实 HTTP、浏览器和 PostgreSQL 通过 |
| 加密备份、恢复、失败迁移、向前修复 | 全部通过，历史数据计数/hash 保持一致 |
| 管理员/教师问卷懒加载 | 两种身份的列表和编制页面通过 |
| 远程 CI | 本轮未触发；等待后续授权推送后确认 |

本机视频 fixture 使用既有 SITUATIONAL_VIDEO_E2E_AUDIO_ENCODER=libopus
选项，因为本机 ffmpeg 未编译 libvorbis；未修改 CI Linux 视频编码配置。
本次没有重复执行未修改的 Docker 镜像构建或完整后端测试；
远程原 HEAD 的后端全量、前端全量、CodeQL、MEDIA-2 和 publication 已通过。
远程 Linux runner 的结果仍须在后续允许运行 CI 时验证，不能以本地通过替代。

## 复现入口

准备隔离测试库，部署迁移并执行原工作流相同的 seed。
视频 fixture 生成的三个 hash 必须加载到后端环境后再启动后端。

在 server-version/frontend 执行：
- npm run typecheck
- npm test -- --no-file-parallelism
- npm run lint
- VITE_COGNITIVE_MODULE_ENABLED=true npm run build
- npm run preview -- --host 127.0.0.1 --port 5173 --strictPort

在 server-version 执行（所有 BASE_URL/数据库环境指向隔离服务）：
- node e2e/browser-preflight.cjs http://127.0.0.1:5173 /tmp/browser-readiness
- node e2e/validate-session-auth-gates.cjs
- node e2e/fe-11-video-fault-browser-e2e.cjs
- node e2e/situational-video-browser-e2e.cjs
- node e2e/situational-bundle-browser-e2e.cjs
- node e2e/fe-11-storage-fault-browser-e2e.cjs
- node e2e/relational-four-role-browser-e2e.cjs
- node e2e/pr5-organization-browser-e2e.cjs

三场景及恢复演练继续按 ci.yml 中同名步骤执行，先生成 fixture，
将后端切换到显式 PR5_SCENARIOS_ENABLED=true 的专用测试入口。
这些步骤不会自动开启 GitHub Actions。
