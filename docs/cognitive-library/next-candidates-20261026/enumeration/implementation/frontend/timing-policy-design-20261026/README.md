# 一套可审的数值设计：仍未批准、未实现

固定基线`97883153077a9527b6b5442feec7055f72933ab4`。这是**项目暂定技术设计**，交外部统筹独立审查及必要用户明确批准；未执行新policy，未改任何运行代码/测试/版本、原50ms/100–25/1–15，未改旧proposal/raw。未来即使技术符合，也只能称client callback/draw技术符合；物理50ms、真实设备/光学验证、效度和常模另保留状态。

## 一页数值总表

所有比较保留原数值，不先四舍五入，不加epsilon。数值是研发预算，**没有一项得到MDN/W3C/jsPsych的数值背书**。

| 对象 | 唯一拟议数值与比较 | 未满足的后果 |
| --- | --- | --- |
| 同一合法施测的准备重试 | host真正准入且冻结的同attempt，最多**2次显式准备**；仅尚未预留/呈现任何task trial时可重试一次 | 不自动循环、不以context/port/客户端改名重置；独立host新准入合法attempt可重新准备 |
| 有界clock probe | **16次正推进**；观测预算**≤20ms**、performance.now总reads**≤262144**；正推进max**≤0.25ms** | 不足/粗/未知/非有限或倒退拒绝，绝不fallback60；0读数不当零成本 |
| 完整准备deadline | 在**probe之前**设置起点，probe＋warmup＋采样全部**≤6000ms** | 到期/覆盖不足拒绝，不删outlier或重采直到PASS |
| rAF warmup/采样 | markers r0..r270；先30间隔warmup，再**240连续间隔**；共271 markers | warmup同样finite/strictly increasing/同realm；坏值立即拒绝，不能跳过凑30个好值 |
| 60档分类 | **P=(r270−r30)/240**，`abs(P−1000/60)/(1000/60)≤0.005`；约**16.583333–16.750000ms** | 不在唯一60/120档则阻止；median仅摘要 |
| 120档分类 | 同式H=120；约**8.291667–8.375000ms**；拟选N=6（60档N=3） | 90/144/100均不准入，不取整/交替/自动换协议 |
| 240样本稳定性 | `P95(abs(Δ−P))≤0.25ms`；`max(abs(Δ−P))≤0.75ms` | 任何失败拒绝；P95用nearest-rank ceil(.95n)，不插值 |
| 仅初始预检的四个60窗 | 每窗Pj仍在冻结同档、`abs(Pj−P)≤0.20ms`；窗均值max−min**≤0.20ms**；各窗复用P95/max | 均值隐藏混合/漂移则拒绝；通过不表示硬件VRR关闭 |
| 疑似漏/过短机会 | `Δ/P≥1.5`或`Δ/P≤0.75` | 拒绝并仅标“疑似”；不把日志标签当硬件掉帧/VRR诊断 |
| 每次正式首draw之前 | 既有**1000ms fixation**开新连续segment；在原`elapsed≥1000`边界，**至少60个间隔**；fixation全段与latest60各用自己的跨度P/P95/max，核冻结同档及距冻结P≤0.20ms；**不要求240或四窗** | 不足即拒绝，不延长1秒、不补fixation/试次；任意idle后都如此，无新增stale秒数阈值 |
| 连续期间在线复核 | 每Δ距冻结P**≤0.75ms**；每可用rolling60同档，距P**≤0.20ms**，复用P95/max | 一旦预留/呈现trial后失败结束同attempt；不切N、不跨response/ready停RAF拼窗 |
| 新formal counter累计marker | 对k=1..N，`abs((rk−r_on)−kP)≤0.5ms` | 阻止累计小延迟；不是旧elapsed≥50的flip epsilon，旧66.6不获通过 |
| draw与marker另外计账 | `abs((startk−start_on)−(rk−r_on))≤0.5ms`；entry滞后marker**≤0.25P** | 防止rAF规律但命令迟到；不声称GPU/像素保证 |
| entry到draw return工作预算 | 保留rawWork，`chargedWork=rawWork+0.25ms≤0.20P`；signed/顺序事实另核 | 0ms标censored并预留0.25；它是工程计账，绝非实耗/精度上界；probe未知拒绝 |
| 失败显示 | 拟只清回原**#808080**背景并终止，不加新mask | 此显示策略本身待审；mask/off/clear失败都不补造on/off，物理offset未知 |

**预算推导必须一起看：** 周期档±0.5%使`N*P=49.75–50.25ms`；marker再±0.5成为**49.25–50.75ms**；command相对marker再±0.5，commandStart跨度最宽**48.75–51.25ms**。它不是50.000ms、物理曝光范围或心理测量等效保证。此草案如被认为过宽须在审阅中明确修改，不能借原数据调到PASS。

## 明确索引、起点与不变的阶段

先取得/核对host合法冻结attempt的claim，这不算task曝光。取得claim后，在probe开始之前设置本次准备起点；6秒包括probe、warmup、采样及首rAF等待，不是probe后另给6秒。每次准备最多271个rAF markers，clock probe不逐条保存26万份相同读数：保留初值、至多16个正推进及read ordinal、总reads/重复次数、异常和资源flags，可还原重复段。probe在elapsed≤20ms且reads≤262144时得到16次正推进、其他规则也满足即可完成，等于cap仍可完成；达到任一cap但不足16次即失败，不再额外读一次，超过cap则即使达到16次也失败。probe的20ms是可观测资源预算；另以Date.now作资源guard（每256 reads及完成时检查，倒退拒绝、不导出epoch），不是刺激时钟，也不保证无法抢占的单次API调用在物理20ms内返回。

`Di=ri−r(i−1)`：warmup为D1..D30；measurement为D31..D270，`P=(r270−r30)/240`。四窗依次为D31..90、D91..150、D151..210、D211..270，Pj对应`(r90−r30)/60`、`(r150−r90)/60`、`(r210−r150)/60`、`(r270−r210)/60`。四个60窗只用于初始预检S03。L02中fixation全段用其全部连续间隔跨度求P_fix，latest60用这60间隔跨度求P_60；两者各自围绕自己的均值算P95/max，各自核冻结H周期档及距冻结P≤0.20ms，不要求fixation有240间隔或四个60窗。全部warmup/measurement原值保留，任何坏值不跳过；240样本不剔outlier、不自行重开测量直到通过。

本提案的counter只替**未来formal名义50ms刺激**调度，按实际发出/无异常返回的首组draw锚定序号0，stimulus序号0..N−1，首次拟画mask序号N。练习1000ms曝光、现有fixation1000ms和mask1000ms仍沿既有elapsed策略，记录真实时长但不声称精准1000ms。新的监测/首draw准入不得偷偷加时或增加trial。

## 身份、重试、idle与失败后的日志

准备预算绑定**host真正准入、冻结的同attempt**。未来须核真实sessionId+attemptNo如何映射到candidate attemptId；此mapper目前是平台依赖，未宣称现API已接。客户端改attemptId/contextId/port名不创造新资格；同attempt曝光后结束不续。另一个由host独立准入的合法新attempt可有自己的两次准备预算，不被本页面过去的测验永久锁死。

`trial exposure reserved`专指**task trial曝光预留，包括练习**；不是host admission、openAttempt或同attempt claim。preflight失败且没有预留/呈现任何task trial时，允许在原claim内显式重试一次，不伪造fresh claim、不清失败记录。第一次/第二次准备都保留；用过重试也保留事实。

response/ready/休息期间会停RAF；下一次既有fixation必须开新segment，不能把等待gap当掉帧或拼240样本。无论等5秒、45秒还是更久，每次正式首draw都在**原1秒fixation内**完成≥60间隔复核；变档即结束当前attempt，不切N，不另做一次fixation或延长这1秒。45秒只是边界场景，没有30秒stale阈值。

失败时拟清原灰底的动作显式待审。只有真实发出/返回的gray-clear命令可记`neutral_background`的命令offset，不能当mask。mask绘制抛错仍可有attempted marker/command，但无成功返回就不补成功mask；灰底clear也失败则offset继续unknown。rAF marker、entry、commandStart/return分别保存，物理像素on/off始终未知，不能填计划deadline、end时间或清屏时间冒充。显示策略获批前不改renderer。

## 每个数值为什么这样提，而非称有文献背书

21条完整规则登记见[policy-design.json](policy-design.json)，每条含数值/单位/表达式/对象/后果、要防的故障、证据等级、负责人角色及复核条件。责任为认知内容线计时负责人（统筹指定姓名），外部统筹独立审阅，平台runner负责人复核可实现性。样本30/240、deadline6s、0.5%/0.25/0.75/0.20、probe和工作预算全是项目暂定；没有误判率或跨设备效度验证。

30+240在理想60/120节奏约需4.5/2.25秒，作为有界准备负担；240能分4个60窗。P采用跨度均值以减少取量化median8.3/8.4直接分类的偏置，但均值会藏单个gap，因此另有max/P95/窗口规则。0.25/0.75/0.20是待审工程稳定性预算；0.5ms marker取名义50ms的1%预算，command另0.5必须披露相加。entry25%与work20%旨在留出其余帧时间，但不是GPU/扫描保证。rawWork加0.25只是预留时钟不确定性账本，不能声称时钟误差或工作实耗上界。

## 原数据能支持和不能支持什么

[raw-statistics.json](raw-statistics.json)是这次唯一执行的只读统计，不执行新准入。原raw SHA256仍`92ce9ca47badb38c0af37e28c4ee497ecf3c5863c4c752a4c7f26290ccace132`。主线另存[同trial统计](../../../../implementation-coordination/timing-policy-review-20261026/existing-raw-statistics.json)。

原3练+25正式为28段、3660个同trial间隔，约16.5–16.8ms且无非正间隔。正式每段只有123–126间隔，最长练习段182；完整270间隔segment为0。正式段跨度P约16.6648–16.6667ms，P95偏差最高约0.13468ms，max偏差约0.16641ms。它只描述这一云端Chromium的短片段，不能跨试次等待拼为预检成功，不能重判任何旧记录合格。

7条4次stimulus回调/66.6ms的直接路径仍是最后49.9ms未过原50比较，下一回调约16.7ms后才转mask。间隔不支持主线程卡顿归因。没有clock probe、entry/draw clocks、120Hz/VRR设备或光学证据；不能因这一次片段接近草案数字，就说阈值、旧25条或设备已验证。

## 权威资料、消费者和下一步

[sources.json](sources.json)将规范事实、框架实现、我们的数值和真实设备证据分轴。MDN说明同帧marker共享且不同于entry；HTML允许调度/节流；W3C HRT所读为2026-09-01 Working Draft，可coarsen/jitter，不保证本设备精度。jsPsych固定`5887b4a50f71fe4b93254754956ea488b0a0c16e`、blob`3ccfa3a3a35d3f33d0402e92959888abdbaa751e`默认60、以entry performance.now差求均值，和本提案的marker跨度均值不完全相同。其simulation可直接返回60，**不得继承为实测/fallback**。仅原创释义/链接，无第三方源码/素材复制或安装。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)、[HTML](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames)、[HRT草案](https://www.w3.org/TR/2026/WD-hr-time-3-20260901/)、[jsPsych browser-check](https://www.jspsych.org/v8/plugins/browser-check/)、[jsPsych timing](https://www.jspsych.org/latest/overview/timing-accuracy/)。

[boundary-cases.json](boundary-cases.json)含22个描述性边界：59.94/接近120、90/144/100、量化、gap/混合/慢漂移、六个小延迟累计、精确边界、clock未知/0ms、长idle、覆盖不足、灰clear失败、原claim重试及host合法新attempt。它们不是已执行测试或真实设备样本。[consumer-map.json](consumer-map.json)列20个具体候选/消费者路径，区分未来必须改的raw/actor/schema与仅需平台审阅的shared边界，不擅改shared core。[validation-plan.md](validation-plan.md)列最小后续范围；**全部未执行**。

本步只有材料生成和只读统计，无旧tests/browser/CI、安装、提交或Notion写入。一个材料生成辅助命令最初有Python语法错误，在写出policy前被解析器阻止，修正后生成；不影响原始数据或运行源码。完成后停写，交主线与外部统筹审核，实质政策待用户明确确认。
