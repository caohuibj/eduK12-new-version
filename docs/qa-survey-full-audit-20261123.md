# Survey 全链路测试与优化验收记录

2026-11-23，Mac 本地隔离环境，合成账号与合成回答。首轮从 main `9af040c8a7bf98a98e0ce70d96cb40101cc6e93a` 开始，工作分支为 `codex/survey-full-audit-20261123`。收尾 fetch 发现 main 已推进至 `b308194abdf8089ea248838d17d3c9ac00261303`（PR #801），本分支已完成 rebase 对齐。最终受检业务源码为 `825e676bd1bd956b10eccb16bbdfd63dc6c4515b`；随后仅调整 history 测试的无效类型参数及本文档。首轮证据仅在受检输入不变时复用，不将旧共享 PDF 合同的通过结果直接当成新合同通过。

规则入口为仓库根 `AGENTS.md`（blob `fa8a592abc6bc18c74dfebb7dc91e8c094ca9721`）和 `docs/release/README.md`（blob `7d199f026361e01bc834feb1721863afbb7b9f7d`）。本轮只做本地审查与可回退修改，没有启动 CI、连接生产或执行部署。旧轮记录 `docs/qa-survey-workflows-20261123.md` 保留原样，本文件说明本轮新增证据。

| 执行清单 | 本轮安排 |
| --- | --- |
| 修改范围 | Survey 入口、研究者工作台、参与流程、管理员身份呈现、素材 PDF 与对应视觉样式；共享 PDF 组件按最新 main 合同定向整合 |
| 故障定位 | 保留首次请求、截图和错误，再区分产品问题、脚本定位假设、HMR 干扰及本机资源波动 |
| 主要执行位置 | 本机 Node + Playwright 驱动真实 Google Chrome；本地 Vite、真实 API、隔离 PostgreSQL/Redis，不 mock API |
| 可复用证据 | 分角色浏览器台账、下载三件套、同批哈希对账、受影响组件回归；变化输入只复验对应项 |
| 时间与检查预算 | 浏览器与角色任务并行；源码检查由主执行处统一，超过约 5 分钟报告实际等待项；文档收尾约 15 分钟，不追加整轮回归 |

## 环境与证据读法

前端使用本机 `survey.localhost:5173`，API 为本地 3000，数据库为隔离 PostgreSQL 55432，Redis 为 56379。参与者、研究者、Survey 管理员和系统管理员使用独立浏览器上下文。新建三名本轮研究者用于正常研究、恢复与资格撤销测试；既有本地 QA 账号用于历史修复复验。凭据、完整招募链接、个人链接、恢复码及下载原件均留在受限本机目录，不写入仓库。

综合 HTML 实际位于独立交付目录 `outputs/survey-full-audit-20261123/Survey全链路测试与优化报告.html`。下文证据路径均相对此目录所在的证据包根 `outputs/survey-full-audit-20261123/`，不表示这些本机文件已经提交仓库。主要台账为 `participant/results.json`、`researcher/evidence.json`、`advanced/results.json`、`admin/cases.json` 和 `visual/视觉复验摘要.json`。真实浏览器动作、正常接口准备夹具、静态分析、自动回归分别记录；静态存在、空列表、按钮可见或参与完成页，均不能替代后台正向读回。

## 设计、逻辑与实现边界

Survey 的主链为工具编制 → 研究内固定副本 → 测量版本发布（需要时）→ 波次检查与冻结 → 开放采集 → 参与者身份及知情同意 → 子任务回执 → 父问卷 FINAL → 质量口径 → 统计、报告与导出。自编量表“完成编制”、测量版本发布、冻结问卷、开放采集是不同操作，不能自动合并。普通组合保存编排顺序，进入研究后展开为固定子工具；混合问卷同时包含不同类型工具，也仍需整份问卷最终提交。

本轮实测支持十三种表单题型、自编量表反向题及均分维度、条件显示与明确拒答、普通组合、多类型混合问卷、多波次关联和描述性纵向指标。SJT 与认知使用系统已批准的精确版本及当前有效授权；没有绕过科学、冻结、用途或当前授权门禁。自编 FORM/COMPOSITION 的公共库申请仍未开放，空来源目录只证明查询与空状态，不证明正向内容流转。私有参考与重解释需要已有能力授权，不以新建绕过审批的常模证明可用。

独立匿名研究不提供多轮身份关联；关联研究分别支持个人链接、可记忆编码、自存随机编码。关联身份本身不足以产生变化报告，仍需首轮正式冻结的有效追踪指标。原始分与变化均作描述性呈现，不构成常模、诊断、显著性或因果结论。服务器加密暂存与 FINAL 分开：主动保存、64KB/24 小时提示、版本冲突保护；匿名模式当前没有用户界面提供的跨设备恢复凭据，不能承诺匿名跨设备恢复。关联模式通过用户实际保存的链接恢复，未从浏览器存储抽取隐藏凭据来冒充界面能力。

系统入库审批、Survey 入口使用许可、具体研究者授权分别工作。研究者暂停、永久撤销、库条目暂停与授权撤销均有不同作用域；历史项目和固定副本保留，不意味着旧权限仍可用于新采集。报告访问还受受众与当前归属检查约束，研究者模板不会自动展示在参与者完成页。

## 实际角色与链路矩阵

| 范围 / 角色 | 本轮真实操作与结果 | 主要证据 |
| --- | --- | --- |
| 访客 / 公开入口 | 首页与四个介绍页，FAQ、锚点、跳至主内容及链接实际点击；共 95 个链接边，含重复目标，其中 85 个公开链接边及 10 个管理员入口回跳。不是 95 个唯一 URL 或后台全部链接的穷举证明 | `participant/results.json`、`participant/public-link-edges.json`、`participant/public-admin-link-edges.json` |
| 开户 / Survey 管理员与研究者 | 签发邀请、浏览器领取、设置密码、绑定验证器、保存恢复码；本轮研究者正常进入各自工作台；未领取邀请撤销后领取被拒 | `admin/cases.json`、`admin/researcher-a-workspace.png` |
| 身份恢复与资格 | 暂停使既有会话失效，恢复后正常重登；密码恢复中断后按真实待绑定状态继续；恢复码一次可用、重放拒绝；重置后旧身份和旧恢复码不可用、新一代有效；独立测试账号永久撤销后登录被拒，历史空草稿保留 | `admin/cases.json`、`admin/password-reset-current.png`、`admin/c-permanently-revoked.png`、`admin/c-revoked-project-retained.png` |
| 研究目录 / 研究者 | 11 个具名前提下分页 10/1、25/50/100 页容量、创建时间排序、关键词与状态筛选、清空筛选；仅对本轮无答卷空草稿归档及恢复；刷新保留指定研究目标 | `advanced/results.json`、`advanced/directory-search-pagination.png` |
| 表单、量表 / 研究者 | 正常 UI 编制条件表单及两题五选项量表，配置反向计分、均分维度和描述性反馈；保存、结构检查、完成编制，显式发布研究内测量版本后冻结开放 | `researcher/evidence.json`、`researcher/02-scale-submission.png`、`researcher/04-publication-375.png` |
| 工具导入、精确引用与归档 / 研究者 | 本轮新增 9 项真实 UI：CSV 与多行文本先预览再确认导入，两题均保留；普通组合精确引用源 FORM，正常 API 前提推进源修订后旧组合检查 409，UI 明确重选后恢复 200；仅独立空 FORM 归档并从列表隐藏。工具归档当前无恢复入口，不声称已测恢复 | `admin/cases.json` 中 `TOOL-*` |
| 十三题型 / 参与者 → owner 后台 | 390px 填写、刷新恢复、提交，owner 正常登录回读。保留旧 2 份，仅新增 1 份，累计/有效 3；本轮 14 个单元格（13 类型及其他填写）逐值一致，数值 0、日期时间、矩阵多选、排序、恒定总和及中文两行长答完整 | `participant/thirteen-final-390.png`、`researcher/thirteen-owner-verification.json`、`researcher/21-thirteen-owner-data.png` |
| 普通组合 / 研究者 → 参与者 → 后台 | UI 编制两个本轮 READY 表单、调整顺序、完成组合；研究空壳由正常研究者 API 准备，选择组合、冻结开放、390px 子工具排序作答和父 FINAL 均由真实 UI 完成；后台两子工具有效 N=1，单选频数正确 | `advanced/results.json` 中 `COMPOSITION-01..06`、`advanced/composition-completed.png`、`advanced/composition-researcher-data.png` |
| 混合问卷 / 四工具闭环 | 条件表单、量表、授权文字 SJT 和 Go/No-Go 依次完成；条件必答阻止推进、条件隐藏、明确拒答、SJT 阶段锁定及子回执、认知练习/正式任务/子回执，最后父 FINAL 成功；后台量表均分 4、SJT 得分 5、REFUSED=1 | `participant/mixed-final-all-four-units.png`、`researcher/17-mixed-statistics.png`、`researcher/mixed-owner-readback-verification.json`（独立台账 `R-MIXED-OWNER-READBACK`，根据留存真实 UI 证据补录） |
| 认知原件 | 120 正式试次导出为 120 行、42 列，排除练习；权威来源为合格父 FINAL 引用的不可变子原件。驱动从第 26 试次接管，前 25 次自然超时；此为软件流程证据 | `participant/cognitive-driver.json`、`researcher/mixed-cognitive-export-create.json`、`researcher/all-export-integrity.json` |
| 三种关联身份 | 个人链接保存/复制/跨上下文重入、错误凭据拒绝；可记忆编码两次输入不一致及错误后缀拒绝；自存随机编码错误值拒绝；各自两轮真实提交及后台关联读回 | `participant/results.json`、`advanced/results.json` 中 `MEM-*`、`SELF-*` |
| 纵向与群体报告 | 历史数字样本新增 6→9，后台与原答宽表匹配；新量表 T1=4、T2=5，个人趋势及相邻/基线变化均 +1；owner 读取单次及纵向群体报告、配对统计、得分导出一致 | `researcher/legacy-export-integrity.json`、`participant/tracking-personal-change-plus-one.png`、`researcher/tracking-longitudinal-group-report.json` |
| 冻结报告与受众 | 发布研究者模板 V1，真实三情境合成预览；T3 冻结 V1 后另发 V2，T3 真 FINAL=5；owner 原报告仍为 V1，第七种解释导出指针、内容哈希、FINAL/绑定摘要与原报告一致；参与者不可见研究者模板 | `researcher/private-report-previews.json`、`researcher/20-t3-original-frozen-v1.png`、`researcher/t3-frozen-report-export-verification.json` |
| 质量、撤回与同 IP / 参与者和 owner | B 独立新项目：空复核理由禁用，排除/恢复使有效数 1→0→1、质量排除 0→1→0，历史留痕；仅撤销未来访问不撤回旧数据，重入被拒；其后历史数据撤回使有效 0、撤回 1、累计 FINAL 仍 1。有效集体窗内同本机 IP 两个独立 context 各提交 FINAL，后台全项目累计 3/有效 2/撤回 1；缺入场凭证不得领取 | `admin/cases.json` 中本轮新增 14 项、`admin/quality-restore-history.png`、`admin/withdraw-backoffice-counts.png` |
| 关联加密暂存 | UI 保存 7，用界面保存的个人链接在新上下文恢复；新上下文保存 8 后旧页面写 9 被 409 拒绝，服务器仍为 8，最终提交 8 | `participant/results.json`、`participant/checkpoint-cross-context-final.png` |
| 配额与暂停 | 配额 1 的首人进入、第二人拒绝；研究者暂停新参与后已开始的首人仍可正常 FINAL；后台累计/有效 1 | `advanced/results.json`、`advanced/quota-full-rejected.png`、`advanced/quota-researcher-data.png` |
| Flow | 静态研究条件控制说明显示；正常完成、提前完成及资格筛除三条路径；空题提交拒绝。后台启动 3、有效 FINAL 2，筛除不计 FINAL | `advanced/results.json`、`advanced/flow-researcher-data.png`、`advanced/flow-statistics.txt` |
| 共享库治理与精确授权 | A 自编量表冻结申请，SYSTEM_ADMIN 读冻结题目/反向计分/维度/反馈及附件清单、填写原因后仅批准 Survey 入口；Survey 管理员给 B 精确授权，B 正常导入；撤销后不可新选用、历史副本保留；库暂停/恢复另有独立临时授权夹具 | `admin/cases.json`、`admin/scale-approved.png`、`admin/b-imported-approved-scale.png`、`admin/library-resume-new-import.png` |
| 系统数据权限 | 查阅理由及近期 MFA 门禁；经本次明确批准的单项目、限定用途授权，真实去隐私下载后撤销；再下载 403。没有将系统身份视为可任意读取所有研究原件 | `admin/cases.json`、`admin/system-audit-answers.png` |
| 素材 / 研究者 | 错误 MIME 拒绝；JPG 上传、真实解码、改名、检索；两页自编 PDF 与小型 MP4 上传；视频真实播放；PDF 自有库预览及共享展示组件均有实际渲染证据；最新 main 保留查看/下载链接并新增显式页面预览，增量复验通过 | `researcher/11-material-image-preview.png`、`researcher/18-material-video-preview.png`、`researcher/shared-pdf-render-release.json` |
| 视觉与键盘 | 就绪基线覆盖浅/深色与 375/390/768/1440 CSS 像素；按钮触达、筛选、编制、数据入口、报告、空状态及对比色定向复验；管理员分区方向键/Home 和可见焦点 | `visual/视觉复验摘要.json`、`visual/keyboard-focus.json`、`admin/admin-final-375.png` |

## 七种导出与后台对账

导出必须通过近期 MFA。CSV、Codebook、Manifest 作为同一批保存；使用系统声明的 `CANONICAL_JSON_SHA256_V1` 校验，CSV 展示 BOM 不参与数据字符串摘要。没有以文件字节哈希不一致误判业务失败。得分清单未提供独立 Codebook 摘要的格式，标记该项不适用，不声称已校验不存在的摘要。

| 请求格式 | 非空样本与实际文件 | 核对结果 |
| --- | --- | --- |
| RAW_WAVE | 新量表 T1：2 行；混合默认：7 行；明确包含自由文本：10 行；十三题型：3 人共 42 行 | 混合完整批保留合成标记、明确 REFUSED、四个 SJT 回答及原生阶段事件；十三题型每个值匹配 |
| RAW_LONG | 新纵向研究：6 行、17 列，2 份当时有效 FINAL | 4 个实际回答及 T3 当时 NO_WAVE 的 2 个缺失单元格，按当批时间水位保留，不能当成重复答卷 |
| RAW_WIDE | 历史关联研究：2 人、5 列、4 份 FINAL | 两人分别 2→4、6→9，无跨人串联 |
| SCORE_LONG | 新纵向研究：2 行、12 列 | 同一冻结测量及评分定义，4→5 |
| SCORE_WIDE | 新纵向研究：1 人、7 列 | 两轮有效记录同人同定义，按原生成时间水位有效 |
| COGNITIVE_TRIAL_LONG | 混合父 FINAL：120 行、42 列 | 正式认知原件，不混练习；计时来源明确不等于物理计时认证 |
| INTERPRETATION_LONG | T3：1 行、29 列 | INTERPRETED、READY，精确冻结 V1，与 owner 原报告同 FINAL、同绑定摘要；无重选 V2 |

`researcher/all-export-integrity.json` 对前九批已下载文件的行数与可用摘要全部核对通过；十三题型独立核对在 `researcher/thirteen-owner-verification.json`。不同格式的 Manifest 中可能使用 WAVE/LONG/WIDE 名称，以请求格式及该批合同联合识别，不拼接不同票据的部分文件。后续新答卷不反向使旧时间水位下的合法导出失效。

## 修复与前后证据

| 问题 | 本轮修改及验证 | 前后证据与状态 |
| --- | --- | --- |
| 已保存个人链接在同标签页被忽略 | 处理后续 fragment 进入事件，仍校验服务器身份并清除敏感片段；不覆盖进行中身份 | `participant/failure-personal-link-same-tab.png`、`participant/results.json` 中同标签页复验；17 项定向回归通过 |
| 已完成波次查看回执再次要求同意 | 已验证本人直接使用原有完成读取，保留归属校验，不创建新的 start | `participant/after-direct-history-receipt.png`；初次自动检查失败保留，受影响两项随后定向通过 |
| 自编量表常用发布主路径缺少下一步 | 已选 SCALE 明确显示未发布测量版本及显式发布按钮，绑定当前保存 revision、沿用 CSRF/科学/冻结门禁；另有原私有报告入口可发布，因此不称整个系统原先无法发布 | `researcher/publication-issue.json`、`researcher/04-publication-375.png`；5 项行为回归及真实发布→冻结→采集通过 |
| PDF 请求成功但空白 | 首轮把自有素材及共享展示的 sandbox iframe 切入既有安全 PdfViewer；两页真实像素、翻页、缩放、375px、关闭验证，共享 PDF blob 创建 1、释放 1。安全头及权限未放宽 | `researcher/13b-material-pdf-preview-after-wait.png` → `researcher/14-pdf-fixed-page1.png`、`researcher/15-pdf-fixed-page2.png`、`researcher/shared-pdf-render-release.json`；最新 main 由独立 `R-26-POST-MAIN-RETEST` 及 `researcher/post-main-shared-pdf-render-release.json` 定向通过 |
| 授权接收者显示内部账号 | 后端按入口提供真实 Survey 登录名投影及排序，保留原 ID 作为授权目标和折叠详情，培训入口语义不变；空值加入类型保护 | `admin/recipient-label-before.png` → `admin/recipient-label-after.png`；隔离 PG 四组身份/授权断言通过 |
| 匿名/暂存/拒答文字误导 | 匿名改为独立匿名、无需注册且采集范围见说明；暂存提示按身份模式区分，拒答不再在参与选择中暴露内部 REFUSED | `participant/results.json` 中 copy 首观察、十三题型当前页面及暂存复验；原答仍保留机器可读拒答状态 |
| 浏览器后退丢失 project/section | 首轮真实后退进入目录并清掉目标，已定位 SurveyApp URL/状态恢复；同项目未保存编辑和在途请求保护必须保留 | `advanced/directory-back-target-failure.png`、`advanced/history-regression-final.json`；9 项定向回归及真实浏览器返回、前进、保留未保存草稿均通过，首错独立保留 |
| 视觉与交互层次 | 手机顶栏、44px 操作、状态筛选、数据五入口、群体报告卡片、素材空态、量表/组合直达工具栏、暗色对比统一优化 | `visual/视觉复验摘要.json` 列 SV-VIS-001..008；暗色导出对比 1.49→10.36，按实际计算色记录 |

最新 main 的共享 `AssessmentMaterialDisplay` 提供受保护 blob 外窗查看及规范 `.pdf` 下载链接。本轮重叠整合保留这两个主干链接，新增显式“在页面预览 PDF”入口复用既有 PdfViewer；初次展开不自动打开画布。整合后 5 个相关测试文件、22 项通过（3 个既有消费者 + 2 个 PDF 专项），无跳过。独立真实增量 `R-26-POST-MAIN-RETEST` 通过：受保护 GET 200，真实下载 2,903 字节且 SHA256 与合成原件一致，page1/page2 非空墨迹分别 7,643/10,485，关闭后画布和链接均移除、折叠恢复，PDF blob 创建 1/释放 1。见 `researcher/23-post-main-pdf-links.png`、`researcher/25-post-main-pdf-page2-rendered.png` 及 `researcher/post-main-shared-pdf-render-release.json`。首轮 R-26 和原四项回归仍保留，不替代新合同证据。

## 首次失败、性能观察与证据修正

所有首错与重试分别保留，不通过重复执行删除首次失败。`researcher/execution-history.json`、`admin/cases.json`、`advanced/results.json`、`visual/environment-events.json` 保留分类和当时状态。管理员早期 `LIBRARY-B-IMPORT` 因没有等待卡片并未真实执行，已明确作废，不进入有效通过计数；以后续 `LIBRARY-B-IMPORT-VERIFIED` 为准。

混合 RAW_WAVE 首次真实 HTTP 500 的 requestId 为 `92adc2d0-32b5-4bac-a07b-7b969c390f98`，脱敏栈停在 analytics 来源读取的 Prisma 事务完成处，精确 P-code 已被日志隐藏，不能断言原答投影错误。过期 MFA 的 403 另行保留；正常重新验证后同输入生成及下载成功，再主动包含自由文本也成功，拒答与子原件没有丢失。该故障没有通过回退删除原件或放宽门禁“修复”，根因仍未确认。见 `researcher/mixed-raw-first-failure.json`、`researcher/mixed-raw-first-stack.txt`、`researcher/mixed-raw-retry2.json`。

SJT 目录及部分授权列表出现过服务繁忙，SJT 首错日志确认 P2028 的 5 秒交互事务过期；仅重读该项后恢复。不能把这一已确认的原因套到所有 500 或所有页面等待。单次混合原答成功生成约 15.7 秒是当时完整 UI 操作耗时，不是单条 SQL 耗时、稳定性能指标或生产容量结论。

本机并发浏览器、源码 HMR、自动检查曾造成等待；发布页一次 60 秒加载等待未完成，随后新上下文正常，未查明原等待根因。另有一次 CSS 请求 ERR_NETWORK_IO_SUSPENDED，只能证明该次网络事件。源码保存窗口已协调，完成上下文及时关闭；不会以无限延长等待把未知问题记成功。首次前端完整 tsc 超过 5 分钟时由主执行者报告进程及等待项，最终返回本轮三处类型错误，随后仅在对应文件补类型保护；导航新增测试又移除一个不受支持的 getByRole exact 类型参数，不改生产逻辑，最终严格类型均通过。

日期时间标签、包裹选项的 label、折叠 summary、同名按钮、自动跳题后的 locator、导出替换确认被驱动自动取消、错误工作目录等脚本问题都先保留再修正，不计为产品故障。新合同 PDF 第二页最初采样碰到画布清空的过渡帧（ink=0），过早记录的 `R-26-POST-MAIN` 已标为 invalidated/HARNESS_ERROR，不计有效通过；保留原 JSON 和截图，只补等待第二页实际非空墨迹后的上述复验。登录恢复上次工具 URL 而非固定工作台、将分区 tab 按 button 定位的等待也仅作脚本假设记录。原文件字节哈希假设及报告受众大小写假设也保留初次核对结果；正确合同分别是规范化 JSON 摘要及小写 researcher，修正脚本后通过，未改产品来迎合错误断言。

## 收尾检查状态与未覆盖边界

| 检查 / 补测 | 当前可确认状态 |
| --- | --- |
| 首轮测量发布组件回归 | 5 项通过，复用 `researcher/publication-vitest-attempt2.json`；首个零收集/错误设置结果保留 |
| 首轮个人链接回归 | 17 项通过，`participant/personal-link-tests.json` |
| 完成回执与同意定向复验 | 受影响 2 项通过，`participant/receipt-and-consent-targeted-retest.json`；初轮失败文件保留，不将测试套件总数当实际执行数 |
| PDF 主干整合增量 | 首轮 4 项保留；整合后 5 个相关测试文件共 22 项通过（3 个既有消费者 + 2 个 PDF 专项）、0 跳过，`pdf-main-integration-tests.json`；真实 `R-26-POST-MAIN-RETEST` 通过 |
| 管理身份投影 | 隔离 PG 四组断言通过，`admin/recipient-identity-native-result.json`；不是 CI 签发 |
| 单文件类型修正 lint | 发布文件退出 0，0 error、1 条 publicationGeneration ref cleanup warning；管理员空值保护单文件检查由主执行者汇总 |
| 导航修复 | 9 项受影响回归通过；真实返回/前进与保留未保存草稿通过；首轮失败保留，源码已冻结 |
| 撤回、质量复核及同 IP 补测 | 本轮新增 14 项真实浏览器通过，见 `admin/cases.json`；区分正常 API 夹具准备与 UI 断言，保留首错，不复用上一轮结果冒充本轮 |
| 工具编制补测 | 本轮新增 9 项 `TOOL-*` 通过，CSV/文本导入、精确修订拒绝与重选、独立空工具归档及列表隐藏均有真实 UI 证据 |
| 最新 main 对齐 | 已 rebase 至 b308194abdf8089ea248838d17d3c9ac00261303，祖先关系检查通过；业务源码 825e676bd1bd956b10eccb16bbdfd63dc6c4515b |
| 最终前端类型 | 原严格 `tsconfig.app.json`，3072MB Node 堆，退出 0，37.02 秒；`frontend-types-final-result.json` |
| 最终后端类型 | 原严格生产 `tsconfig.json`，4096MB Node 堆，退出 0，39.07 秒；`backend-types-final-result.json`；初轮 2GB 堆 OOM 独立保留 |
| 最终 lint 与差异 | 同一本地主执行处检查受影响文件与后续增量，0 error，保留 generation ref cleanup 及既有 Fast Refresh export 两条 warning；差异空白检查通过 |
| 唯一统一前端构建 | 退出 0，16.53 秒，897 文件、32,232,090 字节；`frontend-build-final-result.json`、`frontend-build-file-manifest.json`；未构建后端或 worker 产物 |

最终 12 条检查汇总在 `final-checks.json`，独立增量审查在 `admin/independent-review.json`。前端单次产物文件清单 SHA256 为 `c8e8e88821fa4d3d92f7942a9e42b2456a594e8d8af73a01c8d65966a2d8a860`；来源文件清单在 `final-source-manifest.json`。未执行的临时受影响类型配置不计为通过证据，早期 CLI 不支持、类型错误及 OOM 结果均保留。

私有参考最后短检查 `R-PRIVATE-REFERENCE-BOUNDARY` 仅覆盖真实可见入口和缺输入保护：owner 缺 analyze 能力及九项证据、缺实际 candidate/review 时有明确提示、候选请求为 0、审核/发布禁用。当前界面需手填真实独立能力 UUID，未有可用 grant/candidate 的正常来源夹具；因此未声称后端无授权 403、候选创建/审核/发布或匹配冲突已验收。见 `researcher/private-reference-ui-boundary.json`、`researcher/26-private-reference-missing-capability.png`。全部测试浏览器已关闭。

本轮提供列明角色、前提和路径的真实正向及拒绝证据，不能称为所有设备、所有条件与所有组合的 100% 验收。A/B 子问卷与分组配额的全部分配组合、同 IP 集体采集的人数上限及 48 小时到期、整包治理的全部生命周期、所有高级参考/重解释能力、素材在全部工具/反馈位置的组合、真实双设备与真实断网、暂存实际到期 24 小时、超大文件及大样本并发、物理安全密钥均未完整实测。已测配额 1 和同 IP 有效窗内两名参与者，不等于分组配额全部组合、人数上限或到期极限已测。素材库当前没有归档/删除 UI，本轮未用数据库改动制造正向。

Go/No-Go 真实运行与保存证明软件契约和来源闭环，不证明物理键盘延迟、科学有效反应率、真实人群量表效度或诊断价值。未对生产数据、服务器、发布资格、灾备与容量作结论；本地类型、构建、浏览器及独立 PG 证据也不等于 CI 或生产就绪。最终交付以最新主线整合后的上述实际受影响检查、来源清单和收尾台账为准。


## PR #804 合并前增量（2026-11-23）

用户随后授权推送、审阅并推进合并。候选已对齐 main `2d163a7fb215de9f0756ffa42ca548d93e6ea083`，首个 PR head `60b6e3fac9ec57524456b6cc929779c55af4af84`、tree `402ec10cbdd0315cc7b961e9942a02fde585641a`；原本地浏览器、类型与构建证据保留原输入，不因 rebase 改写为新 checkout 通过。[PR #804](https://github.com/caohuibj/eduK12-new-version/pull/804) 的实际分类为 C/platform/legacy，独立审阅记录与当前 head 审阅记录分开，未修改分类器、合并规则或 CI。

首轮 Ready [run 45157331416、attempt 1](https://github.com/caohuibj/eduK12-new-version/actions/runs/45157331416) 使用 merge checkout `d450287984ed00a7a05afcf876c0d1890caec21c`，保留两项首错：

- Chromium UI job `137635037085` 的 27 项 AppShell 已通过，独立 QA round3 构建因裸 esbuild 不支持既有 PDF worker `?url` 导入而失败，尚未开始该 QA 场景。修复仅为消费者加入精确 URL 解析，并通过环回服务提供已安装 worker 原字节；生产 PDF 代码、校验及安全头不变。
- 前端 job `137634191955` 的 703 个文件中 702 通过，唯一失败为同 IP 回执用例仍要求已完成问卷再次同意。测试改为直接读本人回执，保留原身份与波次 scope，并新增不调用 START/题本的断言，没有放宽新作答的同意门禁。

增量本机仅复验同 IP 文件 20 项、QA 构建合同 2 项及原 6 类真实浏览器场景，全部通过；真实 worker HTTP 200、JavaScript MIME、1,239,047 字节与原件一致，0 page errors。变化测试 lint、3 个 QA CommonJS 文件语法及差异检查通过，不在本机重跑完整套件或重建生产产物。原失败、日志、定向结果及下一轮清单保存在本轮 `pr/` 证据目录。正式资格与历史复用仍以实际 GitHub validator/selected jobs 为准。

仓库指定 Notion CI 历史页读取返回 `object_not_found` 404，错误回写保持 pending；没有创建替代页或声称读写成功。连续两轮完整 CI 不收敛时不再追加第三轮完整 CI，先定位并采用实际支持的受影响复验。
