# 第3批：补齐真实运行、报告与原件链路

> 当前继续进展见 [滚动补全队列](../parallel-review/README.md)。下文c0efd源码冻结是该批历史快照，后续修复独立列证据；GradCPT高刷新记录的提交超限已用专属无损wire修复；保存的research240实例已通过新受影响浏览器生产字节→隔离FINAL/DB/原件消费者，容量/浏览器边界仍保留，详见滚动队列。

已完成9个既有候选的产品接线：8个同类任务＋用户确认几何后的 ANT。
沿用原任务、scorer、public projector、FinalDraftStore、FINAL、DB及私有资产归档；
没有重建任务或另造引擎。源码基线为 `fe9afe7ca`，当前业务源码冻结于
`c0efd66cd07fdbcdc54d11010d2616829aade00c`（tree `5885c9127c4205ec7c5fbae39d5eab088c8d4559`）。
随后重新读取main为 `8774b1cf158dae1c5eb0f4950044c6ae6d6a18dd`（PR372），已正常整合于
`870a9d2f1dfbbff1fb7bf7ed6342bbdfd4bf7f3c`。认知及两端直接类型闭包输入均未变，
[比对原件](evidence/main-integration.json)确认0变化后复用，不机械重跑。PR360保持原状。

## 当前逐包队列

“隔离安装”复用前两批 selected installer 的精确 DRAFT/GRANT、幂等和profile冻结原件。
本批另对9项作真实隔离 START/FINAL/报告/加密归档的定向验证；fixture里的发布仅用于该隔离库。
**源码注册、隔离安装、正式公共库发布和四入口可用是四种状态。**

| 工具（既有候选） | 测验／参数计分／公开报告结构 | 源码／实际入口 | 隔离安装 | 正式发布 | 本轮完成 |
| --- | --- | --- | --- | --- | --- |
| attentional-blink | 完整；原时序与计分不变 | 已注册；authenticated native接线 | 已核DRAFT | 未执行 | 真实任务端口、冻结报告、原件校验 |
| balloon-effort | 完整；理解题与练习不混正式分母 | 同上 | 已核DRAFT | 未执行 | 补齐quiz manifest；独审6组核算及三态消费者 |
| dual-arrow | 完整；保留两通道实际回应 | 同上 | 已核DRAFT | 未执行 | 同上共享链路；不更改刺激/反馈时序 |
| gradcpt | 完整；连续捕获／已呈现与已闭合分母分开 | 同上 | 已核DRAFT | 未执行 | 连续序列原件与单包FINAL适配 |
| hearts-flowers | 完整；中断部分不按答错 | 同上 | 已核DRAFT | 未执行 | 真浏览器8练习＋1完整/1中断正式、报告和归档重试 |
| horizon-exploration | 完整；自由决策不设偏好正确答案 | 同上 | 已核DRAFT | 未执行 | 独审4组核算；修未知呈现版本可被接受的共享缺口 |
| precision-working-memory | 完整；首响应绑定已纠正 | 同上 | 已核DRAFT | 未执行 | 修两种不一致轨迹；中英文解释圆周角度/视角；保留0与null |
| visual-search-two-stage | 完整；原分母/阶段/计分不变 | 同上 | 已核DRAFT | 未执行 | 真实任务端口、冻结报告、原件校验 |
| ANT guided 1.1.0/1.1.0 | 完整；旧1.0.0不扩投放 | 已注册；校准后authenticated native | 已核DRAFT | 未执行 | 获用户图审确认；真实校准/geometry冻结/8练习＋48正式全链路 |
| MOT／Enumeration | 前批已完成；不计作新增开发 | 保留既有入口与版本 | 前批已核 | 本节点未执行 | 证据复用；MOT标尺组件仅增加可选几何容纳回调供ANT复用 |
| 连续图像再认 | 已有实现／定义；素材未齐 | 不冒称可执行完整投放 | 未装素材配置 | 未执行 | pending真实素材；没有替换刺激或伪造授权 |

前8项的旧说明、练习及报告美化见[第2批](../batch-2/README.md)与前批原件。
本批没有把旧候选、旧图表或六包层级修复重新算为新增开发。
其他8包采用正式前缀进行DB消费者验证；不把它说成8包各完整产品实机施测。

## 可以直接审阅的结果

- 心与花：[手机说明](browser/instructions-390.png)、[本次1题结果与归档待确认](browser/report-core-saved-archive-pending-390.png)、[确认后平板](browser/report-archive-confirmed-820.png)、[200%](browser/report-200-percent.png)。
- ANT：[实际校准界面](ant-browser-setup/calibration-390.png)、[第一题练习目标](ant-browser-setup/target-390.png)、[完整说明](ant-browser/instructions-390.png)、[48次正式报告](ant-browser/report-core-saved-archive-pending-390.png)、[200%](ant-browser/report-200-percent.png)。
- ANT完整合成[原件/权威core/冻结report JSON](ant-browser/archived-fixture.json)：56条本机原记录、48正式、8练习；正式48有效/48收到/0排除，interpretable；原始时钟与逐帧记录保留。是软件时钟及自报校准联调，**不是物理曝光精度证书**。
- 空间新增[中文说明](../parallel-review/spatial/screens/intro-zh-phone.png)、[中文报告](../parallel-review/spatial/screens-final/report-zh-phone.png)、[英文200%](../parallel-review/spatial/screens-final/report-en-200pct.png)。这些是明确标注的合成组件预览。
- 三路独审：[气球努力](../parallel-review/effort/README.md)、[Horizon](../parallel-review/horizon/README.md)、[空间](../parallel-review/spatial/README.md)。三者按用户要求使用GPT-6.1 Sol high、独立worktree、同基线 `fdc72a973`；主代理逐项阅读实际diff/代表输入/原失败后集成。

## 关键实现与独立复核

1. 原任务的prepare/persist/finalize映射到现有耐久账本。首次呈现前冻结context、manifest、realm；旧attempt不再曝光；重试同封存原件。正式记录按本机连续前缀补入core，修复React批量补交读取旧trialIndex的问题。
2. FINAL时调用原public projector，把公开报告连同确切身份存入resultSnapshot。读取旧报告只回读snapshot，不能用最新报告配置或COS重新计分。正文/唯一小图/数据表共用任务原质量gate，不公开research map/array/reportBinding。
3. 公开报告的task presentation与generic participantPresentation分别冻结。未知next在前后端拒绝；空间的native0.1.0与quantity formatter0.1.1有明确双版本记录；旧空间/ANT的已存组合保留精确只读兼容，不改写原对象。
4. 原件归档核对已提交core、同seed计划、冻结context/realm、计数和摘要；加密后走既有PRIVATE资产/引用。故障时原件继续留在IndexedDB；真实确认后才清理。没有从COS重算或修正报告。
5. ANT复用已有标尺/观看距离界面，按[已确认图示](ant-geometry-proposal/README.md)冻结物理几何版本/hash、完整display摘要、实际viewport与输入映射。presentationBinding进入权威core哈希；不默认伪填校准，不缩小刺激来适配屏幕。修正原候选拒绝UNIFIED_V1的兼容入口，计算公式/分母/单帧接受原则不变。
6. 空间首事件必须是select/keyboard，firstSelectedAtMs绑定实际首事件。原本两种不一致轨迹会进有效分母，现在排除；正常capture、误差公式、时序和题量不变。此为尚未正式投放0.1.0候选的明确纠错，保留既有身份；旧报告不回算，正式目标库是否已有使用需root在上线前据实核对。

## 验证和复用边界

[证据索引与原失败](evidence/README.md)列出实际命令/退出；不是CI绿灯。
最初本机为Node24.19.0，低于当前engines；原结果保留真实环境，未改称正式资格。
后从nodejs.org取得并核SHA256的独立临时Node24.21.0，未改项目依赖、lock或全局Node。
最终仅补受影响的两端类型闭包、ANT一条真实隔离FINAL/归档、空间2个反例，以及呈现版本专属病例。
早先已完成的8工具数据库前缀、两条浏览器流程和旧计分/时序证据没有机械重跑。

并行独审发现的空间首响应及Horizon版本问题均有原失败；前者两反例修后2/2，
后者专属组件1通过/2失败→3通过。气球独审没有明确业务错误，未强行改方案。

## 留给root的真实剩余项

- 连续再认：现有backend/独立界面可复用；native宿主、专属原件适配、素材冻结/选中安装均未完成。需要真实可解析、可冻结的图片池及素材状态。两profile共需184正式＋6独立练习图；先做体验版则74正式＋6独立练习图。不能拿合成占位图或未知权利冒充正式素材。
- 正式运行库目标、发布权限、真实业务激活仍为pending，由root协调；本节点没有请求生产操作，没有部署或给真实人员授权。
- authenticated standalone/course native已接；public/access-token/composite仍拒绝，`survey/survey-cognitive-api.ts`只有survey scope的read/final，未提供archiveRaw；
  `modules/cognitive/core/useCognitiveSession.ts:215`拒绝native在aggregateOnly/localDraftScope/无archiveRaw路径运行。
  School/Teacher实际采用Composite，尚缺native精确准入、冻结运行事实、完成回执和本域原件端点合同；Survey也使用专属固定Go/No-Go模型，不能仅补一个archiveRaw方法。见[实际入口与最小建议](../../../parallel-review/entry-adapters/README.md)。这不是内容配置缺失。没有移除guard、扩大身份范围或借Training cookie冒充四入口。此处允许一个受支持入口独立入库，不以其他入口缺口伪造全可用或新增科研门禁。
- root独立审计、精确候选CI路线、Ready与合并。PR365/PR372历史CI绑定均不替代PR368；本节点没有触发CI、Ready、merge或部署。

本节点专用PostgreSQL/Redis已停止并自动移除；清理保留不可变发布历史到容器销毁，
没有禁用trigger或删除生产记录。原有两只停止容器未动。所有可审阅证据均在仓库内，非仅/tmp。
