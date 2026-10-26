# 短时点数判断：前端呈现与采集候选

本阶段基于主审提交`d78332d54488cc677dff3dcb2b64761dc3fca207`，只新增独占前端候选、纯投影脚本与本目录证据。用户已批准本批预览与100/25次数；本实现仍为**内部候选，禁止正式施测，未注册/入库**。这是开发自查交付，不是独立审计或上线验收。

## 当前交付

代码在`server-version/frontend/src/modules/cognitive/tasks/enumeration/`：

- `EnumerationTask.tsx`：中英文指导、3次独立练习、100或25候选正式记录、每25轮的人工开始/休息点、1–15整数滑杆和明确确认、键盘Home/End/方向键辅助。正式计时区无导航/对错反馈；统一角色色，白点/中灰候选刺激。实际画布在注视/点阵/遮罩/回答阶段位置不变，不自缩放。
- `display.ts`：必须由host提供带ID/source的校准和候选recipe。缺失、视口/DPR/缩放改变或物理角度换算后区域放不下时，阻止开始。`usage=INTERNAL_REVIEW_ONLY`，配方状态固定`CANDIDATE_RECIPE_NOT_VALIDATED`；没有生产默认recipe或默认校准。
- `capture.ts`：实际rAF状态机与同回调画布命令，逐帧时刻、阶段onset、提前输入事件及实际输入来源有界采集。一次真实回调最多推进一个阶段，不追造丢失的过去画面。响应后停止rAF，不无限采样等待作答。
- `persistence.ts`：host耐久端口合同、realm绑定、曝光reservation、原raw串行保存/重试、独立最终ACK。未实现该host耐久端口就不能开始；候选不提供内存默认端口冒充保存。
- `generated/protocol.ts`：由已冻结backend纯protocol精确投影，保留原seed/平衡顺序/初值。`generated/report.ts`从已冻结backend scorer抽取关闭投影，不带入Node/server依赖。脚本`server-version/scripts/cognitive/enumeration-content.cjs --check`检查源哈希与投影漂移。
- `fixtures.test-support.ts`：显式合成fixture，产品组件不会导入。`enumeration-candidate.test.tsx`是本候选唯一新增前端测试文件。

未修改冻结backend源码/旧证据/共享core、注册、数据库、锁文件、CI或产品入口。未commit/push。主agent负责统一主审和Git/Notion。

## 已批准设计与未冻结科学条件

沿用获批白点/中灰和论文名义5°直径路线：方形中灰显示底，点中心在圆域均匀采样并拒绝重叠；不自行加圆形裁切。host须明确声明该圆域采样仍为项目提案。具体RGB仅候选sRGB，不声称物理中灰/论文规定值。名义时序由显式recipe提供，并只接受获批设计口径：注视1000ms→正式点50ms（练习1000ms）→mask1000ms→不限时回答。此处是**名义状态机参数，不是实际曝光合格阈值**。

遮罩按原预览提案固定：48×48二值、#141414/#EBEBEB、seed20261026、LCG1664525/1013904223的u32 top-bit，1139亮格/1165暗格。每会话生成并在artifact保存一次，各trial仅引用artifactHash；没有默认每trial重新随机mask。点位置由独立、显式版本的seed流和exposure身份确定，原始点位、直径比例、生成seed均在逐trial完整版记录。不使用未清权noise.png/字体/插图。

### 明确时序阻碍：7/25不是50ms

云端实际Chromium/rAF的25条候选正式记录中，**7/25记录了4个刺激帧，draw-command间隔约66.6ms；其余18/25为3帧、约50.0或50.1ms**。0-based trialIndex为1、2、11、12、14、16、22（1-based第2、3、12、13、15、17、23轮）。不能只概括为设备差异，更不能宣称真实50ms已满足。

当前源码用实际rAF时钟比较`elapsed >= nominal50`；rAF量化、浮点比较与时钟分辨率可能影响这个比较，**具体原因尚未完成独立归因**，上述可能性不是结论。没有补数值epsilon、私自放宽容差或静默改帧策略。原代码和完整raw冻结保留；由统筹独立审阅原协议/源码决定帧量化方案及必要设计确认。即使50.0ms的draw-command记录也不证明屏幕像素实际曝光50ms，物理合成/刷新/亮度未测。

所有实际个体解释仍被backend原投影拒绝；界面不展示研究metrics，不生成0–100/能力等级/排名。当前可达报告仅invalid，这是有意的候选门控；三态设计不等于此候选已具备获准的interpretable/limited结果。无报告图片，无须装饰或伪造take-home数据；未来若有图，遵守至多一张及EDUK12.TOP标识。

## 时钟原点、刷新与中断

一个会话artifact记录一次真实浏览器`performance.timeOrigin`及`crypto.randomUUID`产生的pageInstanceId，来源明确为`performance.timeOrigin-and-crypto.randomUUID`。每trial的performance时钟引用同artifact，不向backend伪造新的timeOrigin字段或重置旧数值。

当前策略是：**刷新/新realm或visibility/pagehide/blur/视口变化/卸载中断，就结束该次候选曝光序列**。原记录用于只读和同身份保存重试，不能接续新原点、不能自动补trial或重新曝光。同attempt的已确认和未决曝光marker均不能由host返回new；marker以稳定attempt＋phase/index/显式practice曝光序号为作用域，不以contextId改名绕过。contextId/recipe/校准/seed等改变会创建新组件代际，但不创造重曝权限。

同context＋同port.id的正常新对象rerender保留初始绑定的端口，不清理正在进行的capture；port.id或context实质变化才新代际。dispose后，旧prepare/retain等异步结束不会调用后续trial/final回调或驱动新页面。卸载发生在未完成trial时，先生成runner_restart raw并交旧host retain暂存；host合同要求同步接管待保存原record，并负责卸载后的未确认恢复，组件不会把失败说成保存成功。生产耐久恢复实现仍是平台依赖。

练习中断保留null作答，不报0分或“通过”，且结束当前序列；不会把中断练习算进已完成3次练习。额外practice曝光仅能由明确操作产生、保留其序号；当前中断结束策略不开放同次重做。错答练习仅陈列真实目标/报告数，不使用未批准的“练习通过”门槛。

## 数据和保存边界

会话artifact：配置/seed、recipe、校准/source、真实page origin、固定mask、候选JSON哈希方案。逐trial完整record：core原始合同、生成点位、刺激seed/算法、actual rAF时刻、提前输入事件、overflow/中断/完成方式、artifact引用。core保留实际时钟、帧摘要、响应值/sliderChanges/输入，formal `onTrialComplete`仅传raw，没有客户端score。

技术上限为20000帧、256提前输入事件、512滑杆变化、画布单边4096物理像素等，有界失败终止并记录overflow；不是科学质量阈值，不静默丢帧/截断成成功。帧仅浏览器内存，trial边界才retain；不逐帧请求服务器。回答操作时长包含滑杆操作，不称为感知速度。

host必需提供：已验证的browser durable端口身份、openAttempt的原子realm绑定、retainArtifact、reserve、retain、raw trial/practice ACK和最终complete ACK。每个ACK绑定context/exposure/hash；同record保存并发复用同Promise，失败重试原record，不reserve或重曝；不能在最终ACK前显示保存完成。新realm只能结束旧attempt，不能继续它。具体生产端口、跨标签页并发锁、刷新后待保存只读恢复/导出消费者尚未实现/验收。

`browser-check.cjs`仅作为云端合成host：确实对localStorage做写/读probe，写realm/marker/artifact/raw/final并测试失败ACK和新realm拒绝。它不是生产保存端口，不证明API/鉴权、加密DB、COS或平台final事务。粗设备分类未新增；实际touch/pointer/keyboard、显示/校准/source在候选数据中留存，不修改严格V1 provenance，不把CSS尺寸当硬件型号。

## 检查、失败与复用

冻结范围→可能故障→检查：仅本task与投影；时序/生成漂移→capture/schema合同与真实rAF raw；context旧回调→同id稳定/换id及异步dispose；重复曝光→耐久host要求、realm与marker；保存并发/假成功→串行原record重试与最终ACK；报告泄露→封闭投影；布局→390×844/820×1180/200%实际组件截图。主要位置为云端Node24.21.0和既有官方锁依赖，预算约30分钟。复用backend22项与旧设计证据，不复跑；不做全量tsc/构建/CI。

- `vitest-run1.json`：17项，16通过/1失败，真实exit1。唯一失败是测试首个重试点击后又查询已切换到saving视图的旧按钮，第二次query找不到；产品已正确等待保存。原始失败不覆盖。
- 修正为在同一act内对同按钮引用双击，仅`vitest-run2-targeted.json`复验该项：1通过、16跳过、exit0。合计17项获合格证据，不声称第二轮执行全部。两版测试全文及哈希保留。
- `candidate-typecheck-run1.check.json`：仅候选源码roots的TypeScript检查exit0，无全量tsc；唯一后续改动是上述测试fixture，不是被检查生产源码。
- `projection-check-run1.check.json`：纯协议/关闭报告投影与冻结源一致，exit0；后续输入未变，不重复。
- `browser-run1.check.json`/`browser-evidence-run1.json`：Chromium151.0.7922.173、sandbox=true、localhost隔离、真实rAF，69.47秒exit0，24断言通过，17张原始截图。完整实际3练习＋25候选formal、触控确认/键盘范围、原record保存重试、最终ACK等待、刷新新realm拒绝、中断不判练习通过、无外网/页面错误。未使用fake浏览器时钟。
- 实际canvas的手机四阶段rect均`{x:43.0625,y:104,width:303.875,height:303.875}`；平板均`{x:258.0625,y:104,width:303.875,height:303.875}`。指导/报告200%及英文200%无横向溢出。开发者已实际看手机/平板回答和200%报告截图；review.png仅复用原图的联系表，不复验产品。

`browser-captured-raw.json`完整保留实际采集与调试canvas快照，约2.0MB；其中一份artifact＋28条record的紧凑JSON约206425字节，较大的其余部分是浏览器检查的PNG/调试证据，不是产品强制载荷。不据此推算服务器并发或负载容量。

## 未验证与下一步

未注册/入库；未接正式四入口、API/鉴权、DB/COS、真正平台会话冻结/导出或生产durable host；未做backend算术复验、全量构建、CI、安装、push、合并、部署。云端Chromium视口模拟不等于真实iOS Safari/Android/平板/桌面浏览器或触屏硬件。未测真实观看距离/屏幕物理尺寸/亮度、显示器扫描/物理曝光、遮罩科学等效、中文/英文理解、年龄/人群效度/常模、并发资源。全部代码、依赖、检查和Chromium在云端，未访问用户Mac文件、终端或浏览器。

下一步先由统筹独立审核明确的7/25时序缺口和host耐久/准入契约；必要刺激/时序/输入变更先给示意图并获明确确认。保持本批源码/raw冻结，任何后续修订只复验受影响项，不以开发自查通过替代独立审计或正式施测授权。
