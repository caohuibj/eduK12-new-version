# 第二批接续：剩余配置、报告结构与呈现

接手 head：`e4b1ba0c7cf9fa520e046571c8c68fc4fdf6ce23`。重新 fetch 后 main 仍为
`642fda7ab754790686d6626efac62b73a332e663`；工作区原先干净。沿用仓库规则；未发现
仓库附带 `.agents/skills`。本轮用户已授权继续完成剩余工作，未授权本节点 CI、
Ready、merge、部署或正式业务发布。

## 空间角度的显示结构修复

空间精度 scorer 的四个角度指标原本就是 `{value, unit:'deg'}`；它们是公开的
自然单位值，不是科研统计地图。原通用格式会显示成 `value-back / unit-back`。
现有 `metricFormats` 增加显式 quantity 格式，只接受有限数值＋精确 deg 单位且
无额外字段，输出角度；没有 opt-in 的旧冻结呈现保留原行为。

仅将空间呈现版本从 0.1.0 更新为 0.1.1；不改测量、计分、原始值、原报告版本或
旧冻结数据。`reportBinding`、原始地图/数组仍然不进入公开指标。新定向断言实际
通过（零、null、错单位、额外字段、invalid 和历史无格式版本），见
[evidence/spatial-quantity.json](evidence/spatial-quantity.json)。

本轮起初只读 readiness 探查重复消费了六包先前已合格的结构输入，这是多余执行；
如实保留这次探查身份，不将它作为新增开发或新计分证据。后续不重跑其六包检查。

其他配置与呈现工作的最终执行证据、原失败和续验在同目录逐项保留。

## 九项现有配置注册与隔离安装

注意瞬脱、气球努力、双箭头、gradCPT、心与花、Horizon、空间精度、视觉搜索加入
既有 native definition 与 presentation factory 集合；ANT 使用已存在的 1.1.0
教学定义。配置全由现有协议工厂取得，一个 config 身份加双profile。MOT/点数判断
原配置 JSON 不变；工厂返回 plain-object config，解决先前 interface 缺索引签名
导致的 TypeScript 不兼容，不用不安全断言绕过编译。

[精确选择文件](selected-nine.json) 可供现有 CLI 使用。原旧版 ANT/Enumeration
仍在，未注册近似版本回退；连续图像再认没有拿合成图片填入正式池，因此不造 seed。
新注册本身**不扩大** `assertNativeDeliverySupported` 或 raw-archive 的入口范围。
九项仍是产品运行器/原件适配待接的 DRAFT，不声称已可四入口作答或公共发布。

新建 tmpfs PostgreSQL 实际 preview 零写、创建九个 DRAFT/GRANT、无发布指针/投放。
原数据库断言在核对完整 seed 时发现 ANT 带出了多余身份元数据，失败原件保留为
[installation-original.json](evidence/installation-original.json)。已收窄工厂只返回
安装所需字段；这不改变数据库已写的核心配置，未重复 preview/create，直接从原
数据库失败位置续查核心字段与幂等，九行不变、九条审计、零assignment和release
pointer，见 [installation-continued.json](evidence/installation-continued.json) 与
[可读续验程序](evidence/continue-install.cjs)。

注册两项新用例首轮 1PASS/1FAIL：失败来自过宽的“所有 object 都是科研地图”假设，
空间公开角度 wrapper 不属于科研地图。修正为显式 quantity 白名单，并验证其他
地图/数组仍私有；只续验失败用例。原始及续验分别为
[registration-original.json](evidence/registration-original.json)、
[registration-freeze.json](evidence/registration-freeze.json)。旧两工具测试仅收窄其
选择集到原批次两项，未降低原断言或重跑已合格流程。

直接后端类型首轮发现 plain-object config 的三处 interface 兼容错误，已定向修正，
保留原诊断；最终 [backend-direct-types.json](evidence/backend-direct-types.json)
零诊断。没有全量 seed、全平台 CI、全库计分、权限或 schema 修改。

## 九份说明的完成与保存提示

九份现有说明在完整规则/例子之后增加中英文“怎样算完成”：按该协议真实正式次数
结束，并等保存确认；练习另计，提前结束不补造后续结果，失败只重试同一记录。
没有增加时间估计、练习轮次、输入门槛或更改刺激/时序；原本的完整重练说明继续
由同一组件重呈。

[说明审阅索引](evidence/instruction-review.json) 包含源码哈希及27张实际预览：
手机中文、平板英文和 CSS 200% 压力预览。都是组件级预览，不冒充真实四入口或
原生设备计时验证。完整截图夹具及其首轮标题定位失败会在报告呈现提交保留。

## 七份报告的真实数据图与文字呈现

7份独立报告复用 `CognitiveReportVisual` 和一份仅作用于报告的 CSS，不复制图表引擎：

| 报告 | 图展示什么 | 真实分母与限制 |
| --- | --- | --- |
| 注意瞬脱 | 第一个认对后，第二个认对比例 | 两个均正确／第一个正确，按lag分别计算；零分母缺失 |
| 双箭头 | 各通道单／双任务正确比例 | 正确／要求回应的已闭合窗口；漏答仍在分母；原有符号差值保留 |
| gradCPT | 城市漏按和山景误按 | 各自有效城市／山景分母，不合成总分，真实零显示0% |
| 心与花 | 三规则下的正确比例 | 公开投影既有accuracy；实际闭合窗口含漏答，未执行不补造 |
| Horizon | 信息不等时首选较少采样侧的比例 | 各机会条件真实首自由选择；不把偏好分对错 |
| 空间精度 | 记1个／5个时的平均角度距离 | 原公开投影自然单位与有效／计划次数，不估容量分 |
| 视觉搜索 | 不同字母数量下找对的比例 | 正确／实际完整轮次；不推断稳定搜索斜率 |

每图保留可读文字、准确次数、缺失标记、图表数据列表和EDUK12.TOP。invalid 不画
表现图，limited 继续使用各包既有公开投影，不读内部research maps；原有正文、
解释、建议和限制继续保留。本轮不新增下载路径或服务器绘图，不改变计分/规范版本。

示例通过[原测试中的精确纯构造函数](evidence/report-fixture-provenance.json)产生，
未执行原describe/it断言；只为这7个新报告消费者生成对应合成输入，调用真实scorer
和公开投影。完整可读[原始输入](evidence/report-raw-inputs.json)和
[公开结果](evidence/report-public-fixtures.json)保留，不是真实参与者数据或常模。
新7项呈现断言实际全部通过：[report-presentation.json](evidence/report-presentation.json)。
直接前端类型零诊断：[frontend-direct-types.json](evidence/frontend-direct-types.json)。

图示可直接阅读：[注意瞬脱](evidence/screens/blink-report-phone-zh.png)、
[双箭头](evidence/screens/dual-report-phone-zh.png)、
[gradCPT](evidence/screens/grad-report-phone-zh.png)、
[心与花](evidence/screens/hf-report-phone-zh.png)、
[Horizon](evidence/screens/horizon-report-phone-zh.png)、
[空间精度](evidence/screens/spatial-report-phone-zh.png)、
[视觉搜索](evidence/screens/search-report-phone-zh.png)。

截图原调用成功完成56个场景后，在ANT嵌入说明等待独立H1超时，原调用仍是失败。
夹具改为等待实际H1/H2层级，只续验尚缺的ANT/再认说明6场景，没有重跑56项。
[原进度](evidence/browser-reading-original-progress.json)、
[缺项续验](evidence/browser-reading-continued.json)、
[实际62场景并集](evidence/browser-reading-union.json)分开保留；不能把并集说成原命令
整条成功。无页面异常、横向溢出或SVG标签越界。200%是CSS zoom压力预览，不是
原生手机/平板或计时验证。开发者已逐张查看7张中文手机报告，文字和图例可读。

原构造夹具截断gradCPT时误留下一slot的边界帧，被既有paint证据校验拒绝；只修
夹具的截断，不修改计分或时序容差。原日志保留。最早前端检查在生成文件未形成时
启动，因此报fixture文件缺失，零断言执行；生成成功后再验。完整命令/退出与输入
哈希见[呈现回执](evidence/presentation-receipt.json)。

## 当前真实状态与保留缺口

累计11个现有任务项目的精确配置已分两批在全新隔离库验证安装为DRAFT/GRANT，
不是在一个正式公共库激活了11项。12项目源码实现去重数不增加；连续图像再认仍
缺真实图片池。MOT／点数判断有既有native产品运行器；另外9个项目是后端已注册、
草稿可安装，前端仍只有候选组件及其任务端口，不能声称产品已可作答。

以下按原委托边界交 root 协调，均为 pending／未执行，不是自动审批 denied：

1. **正式运行库安装与发布**：目标库和获授权安装身份尚未提供给本节点。已完成选中
   selector、隔离安装、幂等和冻结；本节点不接触生产、不投放或授权真实人员。
2. **连续图像再认配置**：需至少184个真实正式assetId和独立6个练习assetId，才能让
   同一配置支持research与experience；仅体验需要74个正式ID。必须是真实可加载清单，
   冻结manifestHash与证据引用；授权状态未核可继续如实pending，不能伪造authorized。
   已有synthetic-manifests明确仅逻辑ID，不可作为正式池。未尝试用占位素材安装。
3. **四入口和完整原件**：`raw-archive.service.ts`继续拒绝composite/access-token/无userId；
   School/Teacher实际认知client没有archiveRaw/getRawArchive；Survey client也没有且有
   localDraftScope。`useCognitiveSession.ts`在这些条件下明确拒绝native启动。没有移除
   guard、借用Training cookie或冒称四入口成功。准确源码位置见下方文件清单。
4. **9个任务产品宿主**：`native-runners.tsx`仍只有MOT和Enumeration；其余任务需要把既有
   durable prepare/persist/finalize端口接到真实冻结会话与私有原件链路，不能用候选的
   内存端口、客户端scorer或内部科研字段临时放行。`assertNativeDeliverySupported`
   保持原拒绝范围，未因源码注册自动开放。这是接入工程缺口，不是科研质量门禁。

最小下一步是由root确定受支持身份/原件入口的工程范围，再复用现有宿主和DB/core＋
COS链路补端口；不新增平行权限缓存/注册/报告引擎。正式库目标与素材清单未齐前，
当前可独立完成的注册、草稿安装、说明和7份报告呈现均已有上述实际交付与原始证据。

准确入口文件：
`backend/src/modules/cognitive/raw-archive.service.ts`、
`backend/src/modules/cognitive/task-resource.ts`、
`frontend/src/modules/cognitive/core/useCognitiveSession.ts`、
`frontend/src/modules/cognitive/native-runners.tsx`、
`frontend/src/school/SchoolCompositeRunner.tsx`、
`frontend/src/huiteacher/assessmentRuntime.client.ts`、
`frontend/src/survey/survey-cognitive-api.ts`（均位于server-version/）。

MOT、Enumeration、ANT及连续再认原有报告已逐源码审阅，保留其已有公开投影/三态和
已留存报告材料；气球努力沿首批结果。没有为了凑图对这些已合格报告重新画一套或
重复施测。其余科研、人群、译审与版权状态照原记录保留，不加自动准入门禁。

## 收尾时重新读取并合入 main

收尾读回发现 main 已经合入 PR369，前移为
`aa774983db8edd85b3c1617aef7218f71664746d`。已正常无冲突 merge，保留本批所有
独立提交。上游差异为教育报告事务的 `SET LOCAL join_collapse_limit = 1` 与该
候选的CI/证据控制；没有改本批认知源码、前端、依赖或schema。上游变化文件不在
本批直接类型闭包内；两份当时完整source manifest逐文件哈希复核零漂移，见
[main-integration.json](evidence/main-integration.json)。没有重复应用测试、类型、
计分、构建或截图，也没有把PR369或旧PR365的CI绑定/绿灯当成PR368合格证据。
