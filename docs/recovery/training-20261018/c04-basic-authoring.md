# C04 基础高级 Form 编制 checkpoint

当前新增公开编制 NUMBER / LONG_TEXT / DATE / TIME。单题配置使用公共 FormQuestion；客户端不能指定 itemKey，服务器新建时生成 `q_<DB UUID>`，提交地址仍为 DB item.id。旧五题型不制造 formDefinition，不改变旧哈希、上下文或必答策略；legacy composite.addItem 的选填开放仅限新 typed 定义。新题不含图片、显隐、拒答、other/exclusive。时区必须显式冻结 UTC 或 Asia/Shanghai，日期/时间与数值约束均由公共内核最终验证。

Training 编制复用产品无关 BasicFormConstraints，作答复用 BasicFormAnswer，Survey 的编制、预览和作答使用同控件。控件不包含产品鉴权或图片 API。FinalCompositeAssessment 本机草稿、封存与恢复保持 number 类型，包括 0；空选填保持 null。旧 FinalQuestionnaireAssessment 使用独立旧后台协议，本批不开放 typed 题型，不扩张旧数据库/FINAL。

实际 Training 新主链是 questionnaire-product → composite；section Form 先提交，whole 路径接续 Scale 的原收据/报告 worker。导出仍明确拒绝，C07 才扩展，不宣称导出闭环。

## 本节点验证状态

- 独立 C04 worktree / backend 与 frontend node_modules，官方离线 npm cache，Node 24.21.0，fresh Prisma Client 5.22.0。
- 后端 45/45 定向测试通过，含 C04 authoring/schema/公共答案验证及 C03 facts；backend tsc 通过并生成运行 dist。
- 前端 46/46 定向测试通过；其后仅新增编制四题型测试，该文件 16/16 通过。合计目前 50 个唯一前端用例。
- 前端首轮 tsc 失败于公共控件参数比既有 Survey runtime DTO 更窄；已修为 renderer 接受现有运行字段，未改变服务端 schema。第二轮 app tsc 通过。
- 真实 HTTP、匿名/登录、发布/报告、浏览器与性能尚未完成。检查仍在继续；本提交是源码 checkpoint，不是完整 C04 验收。

修改组件 → 编制 schema/单次 INSERT 与共享控件、typed FINAL UI；检查目标 → 非法配置发布、数字字符串化/0丢失、空值混淆、封存恢复与Survey/旧题退化；主要位置 → 当前节点独占 measurement lock；复用 → C03 未改的数据迁移/V1/hash与运行前置 manifest 证据；预算 → 本轮针对性验证约 15–25 分钟，失败定点修复，不启动 CI、PR、生产或 Mac 操作。

## C04 后续验证结论（保留前述 checkpoint 历史）

业务源码固定于上面的 C04 checkpoint，之后仅增加测试、隔离 harness 与证据。当前功能/协议定向检查已经完成，浏览器仍阻塞；不能称完整 UI 验收通过。机器可核对证据在 `c04-evidence/summary.json`，每个原始输出保留独立 SHA-256。

- 后端 61 个唯一用例通过：首轮 45；直接新增服务原文件 14（8 首轮通过，6 因测试模块导入早于文件内环境赋值而读取认知关闭，显式环境 `COGNITIVE_MODULE_ENABLED=true` 后仅补这 6 项通过）；新增 typed UUID/选填限定 2。未改认知开关或业务断言，原失败日志保留。
- 前端 97 个唯一用例通过：初始 46、新编制 4、负数/5600字符本机刷新恢复 2、直接受共享控件影响的 Survey builder/preview/FINAL 45。选名执行中未选用例记 skipped，不把它们计作新的成功。app tsc 与 Vite build 通过；改动源文件 eslint 0 errors，保留 ResearchPreview 既有 effect dependency warning 1 条。
- 真实 HTTP 第一次完整尝试共 129 请求：4 组已通过，最终 whole 功能开关未启用而 409，整轮仍记 false。4 组包括编制非法定义无写入；数值/长度/日期/时间不合法 FINAL 无接受事实；登录 section/报告/幂等；匿名凭据恢复与负数/报告。4800字符中文/换行/引号原文完整保留，0 与 null 保持不同。
- 只补缺失 whole/导出 46 请求、2 组通过：隔离 runtime 显式打开原有 whole flag，Form sections 后接 Scale whole 收据重放、真实 worker 报告、typed 导出继续明确 400。未重跑上述 4 组。每个题型按当前真实编制生成的独立 section 提交；没有用数据库修改合并区段来绕开 revision guard。
- 只补匿名边界 31 请求、1 组通过：错误 recovery、A 的凭据读 B/向 B 提交/读 B 报告均 403；B 已接受快照及报告逐值不变，A 无接受事实。保留所有原权限/租约/终态校验。
- 这些是分阶段证据，不能把 129+46+31 描述成一轮全部通过。各阶段使用同一 Node24.21.0/fresh Prisma/生产 dist 指纹，真实 PG16.15 显式 UTC 与 Redis7.4.11；原启动 fingerprint 与 consumer fingerprint 只读核对一致。整库升级证据复用未变 schema 的 C03，不重新执行。
- 观察记录逐请求字节数与耗时，仅供诊断。新增存储仍在原 INSERT 内一次写入定义，未为每题添加读取；未实测 SQL 次数、队列容量或并发性能，不能声称性能优化。新前端 build manifest 只证明本地产物，不是正式发布资格。

### 失败、限制与可复现入口

初次 harness 将 product 表单调旧 composite 区段编辑接口，收到 `QUESTIONNAIRE_REVISION_REQUIRED` 409；改成当前真实编制/逐section流程，没有放宽保护。其次 whole flag 默认关闭，已在独立恢复实例明确开启并只补缺项。`c04-evidence/tested-full-smoke.mjs` 与 `tested-whole-smoke.mjs` 是与运行时原哈希逐字节匹配的溯源版本；当前入口是 `server-version/scripts/recovery/c04-basic-{http.py,smoke.mjs}`，新增了 auth 模式。完整组装入口没有再重跑一整套。

浏览器复用当前节点 `/usr/bin/chromium`，但 Unix socket 被环境拒绝，尚未访问测试页面。同命令工具升级在沙箱启动器的只读内部目录失败，未启动新子测试；没有读取该目录、改权限、换节点或继续重试。保存的浏览器脚本已显式 `chromiumSandbox:true`，该新参数版本仅语法检查，未实际启动。没有截图、视觉/响应式、浏览器端真实交互或无障碍通过证据；组件测试不是浏览器验收的替代说法。前述失败运行的自建 API/worker/PG/Redis/前端均已受控停止。

需要在允许浏览器 IPC 的同类隔离环境补测时，用 `c04-resume-http.py --phase browser`；当前边界不支持，因此本轮停止该路径。`--phase whole` 与 `--phase auth` 只执行对应缺项，必须先确认 state 为本轮自建且已停止。fresh launcher 的 `--whole-submit` 是显式隔离选项，默认仍关闭；不改变任何生产配置。

### C25 浏览器接续适配点

用户已确认本批 CI 可使用隔离临时 HTTPS、浏览器专属证书信任和回环代理，结束后清理；本轮未执行该 CI。优先接用已有 `server-version/e2e/training-optional-https.py` 与 `.github/workflows/ci-browser.yml` 的 Training optional 阶段（独立 HOME/NSS/CA、5443 回环代理、真实 HTTPS Origin/Cookie/CSRF、无 ignoreHTTPSErrors、finally 清理）。现有 wrapper 固定执行 `training-optional-form-browser.cjs`；C25 需要把 C04 场景纳入该受控入口，并把 C04 脚本当前仅允许 127.0.0.1 的 URL/网络白名单适配为该已验证固定 host 与端口，沿用 host-resolver 回环映射及正确 fixture/output 参数。不要把当前 HTTP 预览脚本直接说成已完成 HTTPS 验收，不另造生产域名、系统信任或免校验证书方式；本提交不改 workflow 或触发 CI。
