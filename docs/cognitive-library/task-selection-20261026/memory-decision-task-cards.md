# 第二轮：记忆、决策与元认知六项候选

## 先看结论

**保留全部六项作为跨领域研究候选，不代表已入库或可直接上线。** 连续再认、两阶段、努力选择及元认知可优先审MIT逻辑适配；精度工作记忆与Horizon优先文献/官方协议独立自研。所有素材与最终项目用途仍单独核权。

- Horizon demo只有3局，deadline未在后续选择重设，forced_choices未直接输出。
- WM是颜色提示的位置估计，而非朝向再现；15练习、400正式、3秒仅警告。
- 两阶段概率日志为更新后FB_probs；累计奖励不是model-based指标。
- 努力任务直接匹配2024论文，但源码6秒选择与论文6.5秒有差异；72/54/36不是同一协议。
- 元认知信心显示1–7但输出0–1；决策RT ms、信心RT s，4秒超时NaN；实际100/100平衡需核。
- 连续再认原评分为image-level；不能不加定义直接变为个人能力分。

**建议顺序（仅研究）**：先冻结连续再认与精度工作记忆；再完善努力选择的选择/执行契约；Horizon、两阶段与元认知待分析/报告契约后分批。均不承诺入库。

## 边界与读法

优质来源筛选与协议静态研究；不编码任务、不执行第三方软件、不建云任务、不外部写入。输出只含自写摘要与链接，不上传完整上游源码/数据/素材。

基线main ff8471 legacy score必需number；v2结果可含null/负metrics，但该固定基线的registry仍基于legacy entry，选择native-v2不自动解决。六项保留自然单位、分母/缺失、拟合状态，不编造0–100。只登记能力需要，由 PR #356 对应平台负责人按其实际固定 head 评估；不判断当前 PR 是否已满足，不修改 core。

### 四类规则
- **技术质量规则**：设备、时序、输入、数据完整性及计算可定义性的检查；不产生心理标签。
- **理论参照**：明确模型或范式假设的解释边界，不是经验常模。
- **文献经验**：原论文或上游研究实现的参数/筛选经验，须说明人群、版本与出处，不能自动转为项目阈值。
- **项目暂定研究者规则**：项目另行设计/拟研究规则，必须标暂定；本轮不凭空设置个体常模/诊断/最小trial阈值。

### 版权三类（不同于实现策略）
- **第一类**：有明确许可且本项目实际满足条件时，可公开GitHub；GPL/NC-SA的条件仍保留，不等于所有产品用途都获准。
- **第二类**：有明确系统内使用授权但不宜公开库；本轮没有足够证据将任一未知资产归入此类。
- **第三类**：授权不明或需要额外作者许可；未核资产不因在GitHub可见而获准复制。

普通用户例句均以实际指标和质量为前提，不预设哪种条件表现更好；研究层可保留专业公式。卡内版权路线与实现策略分开，分类词与 [通用模板](candidate-qc-template.json) 对齐。

## 协议卡目录

- [连续图像再认：随机延迟重复示例版](#continuous-recognition) — 源码逻辑适配候选；素材更换与数据契约完成前暂缓接入
- [精度工作记忆：颜色提示空间位置延迟估计](#precision-working-memory) — 优先文献/官方协议独立自研；GPL源码只作受许可约束的参考
- [Horizon探索决策：四次强制采样后短/长前景](#horizon-exploration) — 优先文献独立自研；当前demo不作为完整任务直接采用
- [两阶段强化学习：Experiment Factory 2秒成人变式](#two-stage-learning) — MIT状态机/数据逻辑适配候选；模型分析与协议验收前暂缓接入
- [气球努力选择：50/100/200按压与比例奖赏版](#balloon-effort) — MIT配置/状态逻辑适配候选；先冻结72试次实验室版本与6秒源码截止
- [语义判断后的信心：GDP/食物双条件阶梯版](#metacognitive-confidence) — MIT两阶段响应逻辑适配候选；材料权利和模型研究先行

## 仅登记给平台356的能力需要

- 多阶段trial链接与阶段时钟/单位
- 带分母和无效理由的率、差值及自然单位指标
- null/负数/拟合失败的明确结果语义与不依赖伪总分的呈现
- seed＋完整刺激/offer/转移/reward manifest重放
- 模型版本、拟合状态、区间和适用范围记录
- 有效选择与超时、无反应、技术中断分离

## 研究方式与可追溯性

继承34仓评审的SHA及已核许可证；本轮只补上述六任务的具体参数/流程/计分关键路径及对应一手文献或官方文档。不把源码可读性当授权、不把测试存在当通过。
既有34仓来源清单 SHA-256：`49461208084daef7f11a996ba5fc9bd569287267244010fe35227bb44bf94060`。

没有运行第三方代码/测试/CI，也没有验证浏览器时序或拟合正确性。文献中的原研究效度、任务源码行为和本项目新版本效度严格分开。

- CNTRACS官方网页全文一度502；已用固定SHA官方README作主要参数依据。
- PMC三篇全文返回recaptcha；未绕过，转用作者/机构PDF或可见搜索摘要，实核链接见各卡。
- 一次Horizon index.html返回404；通过目录确认实际experiment.html并读取成功。无写入或权限请求。

---

<a id="continuous-recognition"></a>

# 连续图像再认：随机延迟重复示例版

**方向：源码逻辑适配候选；素材更换与数据契约完成前暂缓接入**

- 构念：在连续图像流中识别曾见图像，同时观察误报与短间隔警觉性。该来源首先服务于图像层面的memorability，不是已标准化的个人记忆能力测验；刺激难记与参与者记不住不可混为一谈。
- 固定版本：`nwrim/continuous_recognition_task_jsPsych@b4ad68e5376ee7256763abb622cf06470514edf5`
- 状态：固定快照静态协议候选；未运行、未移植、未入库、未实测时序
- 常模边界：无本项目、本地年龄/语言/设备常模；无个体诊断阈值；不生成0–100综合分

## 协议与原始数据

- **练习**：此固定示例只有说明后直接开始；未定义独立练习、练习正确率门槛或通过/失败循环。
- **正式**：example/example.html：targetNum=60，imgBlockSize=4，firstRepeatDelay=5，minRepeatDelay=4，vigilanceInterval=4，fixedOrder=false。按calculateTrialNumbers公式计算65块、260次图像呈现：60首次目标、60目标重复、124首次填充、16警觉重复；另交错260次ISI。上述是静态算术，不是运行实测。
- **刺激**：示例图像512×512，注视图400×400；随机重复版不是Bainbridge原始固定顺序版。重复间隔按块定义，必须保存实际试次间隔，不能将minRepeatDelay=4直接写成4张图片。
- **响应**：说明要求见到重复按R；example设置recordAllKeys=true，故运行层记录所有键，而Python评分仅认可R/r/82/114。新图不按键。
- **时序与截止**：图片750ms，ISI 800ms，均固定时长、响应不提前结束。分析默认将紧接的ISI有效按键并入上一张图；这与说明“不要在+时按键”并存，须显式保留。260×1550ms=403秒，约6.7分钟净呈现，不含说明/加载。
- **必要原始字段**：trial index、stimulus ID/hash、trial type、首次/重复配对ID、实际lag、image/ISI相位、各相位按键和RT、有效键规则、consolidate_fixation、完整序列、seed及版本；原仓只提供img/type/rt/keyPress数组，未内建持久化。

## 计分

- **描述指标**：目标重复hit/(hit+miss)=HR；目标首次false alarm/(false alarm+correct rejection)=FAR；CRR=HR−FAR，范围−1至1。必须分别报告分母、缺失和有效重复数。脚本最终聚合为“每张图跨参与者”的指标；个人按会话汇总属于项目另定义的描述统计，不能称原作者个人量表。
- **方向/解释**：在相同刺激/间隔/规则下，CRR越高代表本次重复识别与误报的差值越大；HR高而FAR也高不意味着记忆更好。
- **模型指标**：本卡不追加d′；若以后采用需另冻结极端比例修正、信号/噪声分母及公式版本。
- **不应出分情形**：目标首次或重复分母为0、序列错位、图像加载失败时不生成对应率；零vigilance时警觉性排除项不可计算，不能由NaN比较默默放行。

## 四类规则（不可混用）

### 技术质量规则
- 上游校验图像/ISI交错，且对序列参数和重复间隔有校验工具；存在浏览器测试但本轮未执行。
- 需核刺激加载、完整序列、配对关系、响应合法键、ISI归属和分母>0。这些检查失败表示数据不完整，不表示记忆弱。

### 理论参照
- CRR=HR−FAR是误报校正的描述差值；0不是临床正常线，负数不是负的记忆能力。

### 文献经验
- 上游评分实现默认排除首次填充图FAR≥0.70或警觉重复miss rate≥0.70；这是该研究工具的默认质量筛选，不是已验证的普适阈值，也不是诊断阈值。
- 作者官方Experiment Maker将任务定位为刺激集memorability测量；未核得本示例版个人能力常模或个人异常界值。

### 项目暂定研究者规则
- 若研究需要个人反馈，只展示本会话HR/FAR/CRR和不确定性，不显示人群百分位。任何新增练习、缩短时长、失焦剔除阈值须另预注册；本轮不设数值。

## 反馈边界

- **可说**：本次在 {重复图片有效次数} 次重复图片中认出了 {正确认出次数} 次；在 {新图片有效次数} 次新图片中，有 {误认次数} 次误认为见过。两项需一起看，只描述这一组图片和间隔下的记录。
- **不可说**：“你的长期记忆只有62分／低于同龄人／有记忆障碍”；“某图容易记住，所以你的记忆力强”。
- **受限时**：部分图片或重复间隔记录不完整，受影响部分不作解释；未受影响的记录也不能据此换算为记忆能力排名。
- **无效时**：本次有效记录不足或关键流程不完整，暂不提供表现结论。
- **使用条件**：以上可解释示例必须由实际指标及质量状态支持；方向相反时按实际写，不能支持差异时只列记录，不预设结果或声称等效。


## 版权路线（与实现策略分轴）

- 第一类：MIT代码在保留版权与许可文本条件下可公开GitHub/适配；第三方jsPsych另保留其许可。
- OMI示例脸图为CC BY-NC-SA 4.0，只有满足非商业、署名、相同方式共享条件才属第一类；本项目适用性尚未确认，暂不带入。其他未明素材第三类待核/待授权。
- 本协议摘要和证据链接可公开；不含上游完整源码、脸图或参与者数据。

## 三种实现策略

- **代码适配**：优先抽取序列生成、重复配对和计数逻辑；MIT不等于示例素材获准。
- **文献自研**：若更换成自有图片，保留范式但须重新评估刺激难度/记忆性；不得沿用旧刺激的效度与常模。
- **暂缓**：直接部署原示例，或作为标准化个人筛查量表，均暂缓。

## 精确缺口

- 冻结fixedOrder=false与ISI并入策略；决定是否保留all-key记录但只R有效。
- 为个人反馈另定义会话分母与interval strata，不能照搬image-level输出。
- 新增有权刺激清单、加载失败和失焦日志、seed及持久化；零分母路径需测试。
- 没有本地常模、重测可靠性和最小有效试次数证据。

## 证据

1. [example/example.html](https://github.com/nwrim/continuous_recognition_task_jsPsych/blob/b4ad68e5376ee7256763abb622cf06470514edf5/example/example.html) — 固定参数与仅说明无独立练习
2. [jspsych-continuous-recognition-task.js](https://github.com/nwrim/continuous_recognition_task_jsPsych/blob/b4ad68e5376ee7256763abb622cf06470514edf5/jspsych-continuous-recognition-task.js) — 试次数公式、固定时长、随机与序列生成
3. [scripts/03_calculate_metrics.py](https://github.com/nwrim/continuous_recognition_task_jsPsych/blob/b4ad68e5376ee7256763abb622cf06470514edf5/scripts/03_calculate_metrics.py) — 有效键、ISI合并、0.7筛选和image-level HR/FAR/CRR
4. [README.md](https://github.com/nwrim/continuous_recognition_task_jsPsych/blob/b4ad68e5376ee7256763abb622cf06470514edf5/README.md) — 定位、原始lineage、随机重复变式与不含保存功能
5. [LICENSE](https://github.com/nwrim/continuous_recognition_task_jsPsych/blob/b4ad68e5376ee7256763abb622cf06470514edf5/LICENSE) — MIT
6. [Bainbridge官方Memorability Experiment Maker](https://www.wilmabainbridge.com/makeexperiments.html) — 原始任务用于自有刺激集memorability；不是个人常模
7. [OMI固定素材许可证](https://github.com/jcpeterson/omi/blob/53bb3c13113afc3ae67aa6ede4ac9dfe33f306af/LICENSE.txt) — 示例合成人脸NC-SA限制；沿用第一轮实核证据


---

<a id="precision-working-memory"></a>

# 精度工作记忆：颜色提示空间位置延迟估计

**方向：优先文献/官方协议独立自研；GPL源码只作受许可约束的参考**

- 构念：记住1个或5个不同颜色条形所在的圆周位置，延迟后按颜色提示点击位置。不是条形“朝向”连续报告，也不是数字/空间广度。角误差反映空间再现；κ和Pmem是指定混合模型下的估计，不是直接观察到的容量。
- 固定版本：`lucklab/CNTRACS_tasks_public@e641a9e0dfdc50d15a227833fc89bd80f3edf95a`
- 状态：固定快照静态协议候选；未运行、未移植、未入库、未实测时序
- 常模边界：无本项目、本地年龄/语言/设备常模；无个体诊断阈值；不生成0–100综合分

## 协议与原始数据

- **练习**：PRACTICE_WM_Capacity_BEH.py默认TrialsToAdminister=15；含颜色/显示器测试、说明和鼠标操作练习。未见按正确率自动晋级阈值；不把生成400条候选列表误称练习400次。
- **正式**：WM_Capacity_BEH.py：setSizes=[1,5]，每条件200，共400试次；每40试次休息。100个候选圆周位置，五种颜色。官方README估计25–30分钟。
- **刺激**：圆半径3.5°视角，条形长1°、宽0.1°；默认显示1920×1200、宽52cm、观看距离100cm。浏览器像素几何不自动等同这些视角。
- **响应**：中央光标变为目标颜色；用鼠标左键点击圆环，接收区域半径3.3–3.7°（由3.5±0.2推导）。必须保存目标和反应角及坐标；不是任意屏幕点击。
- **时序与截止**：编码500ms、保持1000ms；ITI约1000ms并按random.randrange(-50,50)抖动，即−50至+49ms。3秒后声音提醒，响应窗口开放，提醒不是3秒超时排除。源码帧计时，反应RT为秒。
- **必要原始字段**：setSize、目标/非目标位置及颜色、probedAngle、respAngle、signed circular error、absolute error、respXY、respRT、respLateWarning、实际编码/保持时长、完整trial manifest与seed。

## 计分

- **描述指标**：按set size分别报告圆周最短绝对误差（度）和分布，平均绝对误差越小代表本条件位置再现更接近目标。不能合并1项/5项后称一个容量分。
- **模型指标**：WM_analysis_demo.R用Pmem×von Mises(均值0,κ)+(1−Pmem)×uniform的混合似然；分set size拟合，κ边界0.001–1000、Pmem 0–1，九组起值网格选择负对数似然最小结果。边界是数值优化范围，不是正常范围。
- **方向/解释**：κ较大表示模型中非均匀部分更集中，Pmem较大表示模型分配给目标中心部分的比例更大；不能直译为某个人确切记住了多少个物体。
- **不应出分情形**：坐标无效、时序不完整、拟合不收敛/参数不可辨识时，保留原始描述并将对应模型指标置缺失。示例R²为分箱分布相关平方，不是效度认证。

## 四类规则（不可混用）

### 技术质量规则
- 保持实际显示尺寸/距离、颜色可辨性、有效点击圆环和阶段时长的记录。刷新/失焦/加载失败另作技术标签，未经试测不设毫秒容忍度。
- 源码设置seed传入sequential TrialHandler，但此前Python random.shuffle/sample已生成列表且未见random.seed(seed)；仅保存Seed字段不能保证重放。

### 理论参照
- uniform＋von Mises是关于误差生成的模型假设；该两成分模型没有单列交换/误绑定成分。κ和Pmem的解释依赖模型匹配，非疾病指标。

### 文献经验
- 官方任务说明给出1/5项目、κ/Pmem与约25–30分钟；未见此发布版个人正常/异常阈值。
- R示例的优化边界、起值与maxit=2000是分析实现设置；不是质量合格阈值。未发现该示例中统一参与者剔除比例。

### 项目暂定研究者规则
- 先用误差分布作无常模反馈；拟合要补参数恢复、置信区间、边界解和swap模型敏感性研究。本轮不决定最少有效试次或模型通过线。
- 若改为较短/手机触屏/屏幕像素单位，单列新版本，不宣称CNTRACS原版复现。

## 反馈边界

- **可说**：记住 1 个位置时，本次落点与目标的平均距离为 {一项平均角误差} 度；记住 5 个位置时为 {五项平均角误差} 度。距离越小表示这次落点更接近目标，颜色辨认、鼠标和显示条件也可能影响结果。
- **不可说**：“你只能记住2.3个东西／工作记忆受损”；“Pmem=0.6代表你60%的日常记忆正常”。
- **受限时**：部分位置或显示记录不完整，暂不比较相应条件。即使保留位置误差描述，也不把不稳定的模型结果解释成记忆容量。
- **无效时**：本次有效记录不足或关键流程不完整，暂不提供表现结论。
- **使用条件**：以上可解释示例必须由实际指标及质量状态支持；方向相反时按实际写，不能支持差异时只列记录，不预设结果或声称等效。


## 版权路线（与实现策略分轴）

- 第一类（有条件）：GPL-3.0允许依约公开和修改；嵌入本项目需另审组合、分发与对应源码义务，不默认能纳入不同许可产品。
- 本卡只选程序化颜色条/圆环；说明幻灯片和其它任务图片不默认随GPL全部放行，未核素材第三类。
- 仅自写协议和公式说明，不附上游完整Python/R或示例参与者xlsx。

## 三种实现策略

- **代码适配**：仅在GPL兼容部署/分发路线获确认后考虑，且须独立验证时间、随机和拟合。
- **文献自研**：当前首选：依官方规则与模型思想编写自己的实现、图形和分析验证；不复制GPL表达规避许可。
- **暂缓**：短版个体常模解释、自动模型标签及未验证的浏览器等效宣称。

## 精确缺口

- 视角和输入设备校准；不能以默认CSS尺寸替代原研究条件。
- 需保留有符号角误差，不能只拿绝对respError去拟合对称圆周分布。
- R示例未充分报告拟合收敛和区间，样本数/可靠性要求未冻结。
- 主程序与练习均需更完整随机重放；颜色/显示可及性调整要另记版本。

## 证据

1. [README.md](https://github.com/lucklab/CNTRACS_tasks_public/blob/e641a9e0dfdc50d15a227833fc89bd80f3edf95a/README.md) — 官方工作记忆协议、时长与测量参数
2. [Working_Memory/WM_Capacity_BEH.py](https://github.com/lucklab/CNTRACS_tasks_public/blob/e641a9e0dfdc50d15a227833fc89bd80f3edf95a/Working_Memory/WM_Capacity_BEH.py) — 400试次、500/1000ms、圆环、响应和seed
3. [Working_Memory/PRACTICE_WM_Capacity_BEH.py](https://github.com/lucklab/CNTRACS_tasks_public/blob/e641a9e0dfdc50d15a227833fc89bd80f3edf95a/Working_Memory/PRACTICE_WM_Capacity_BEH.py) — 15练习及显示器/颜色测试
4. [Working_Memory/analysis_demo/WM_analysis_demo.R](https://github.com/lucklab/CNTRACS_tasks_public/blob/e641a9e0dfdc50d15a227833fc89bd80f3edf95a/Working_Memory/analysis_demo/WM_analysis_demo.R) — 模型、拟合边界/起值、误差重算和R²
5. [LICENSE](https://github.com/lucklab/CNTRACS_tasks_public/blob/e641a9e0dfdc50d15a227833fc89bd80f3edf95a/LICENSE) — GPL-3.0
6. [CNTRACS官方任务目录](https://sites.uci.edu/cntracs/tasks/) — 第三阶段延迟估计任务定位；本轮页面全文获取502，搜索可见官方目录，不据此补造参数


---

<a id="horizon-exploration"></a>

# Horizon探索决策：四次强制采样后短/长前景

**方向：优先文献独立自研；当前demo不作为完整任务直接采用**

- 构念：把先验信息量与当前收益解耦，比较未来只剩1次或6次自由选择时的信息寻求和决策随机性。不是“新奇偏好人格”、冒险诊断，也不能用累计奖励作为探索能力分。
- 固定版本：`nivlab/jspsych-demos@a819c4cae29e629508847a0abe5cd1e5e36baa42`
- 状态：固定快照静态协议候选；未运行、未移植、未入库、未实测时序
- 常模边界：无本项目、本地年龄/语言/设备常模；无个体诊断阈值；不生成0–100综合分

## 协议与原始数据

- **练习**：demo有图示说明和3道理解检查；当前已审comprehension插件输出num_errors，练习正式试次数须由研究者补齐。没有证据将3个示例局称标准练习或已验证短版。
- **正式**：horizons-experiment.js定义3局，experiment.html只把HORIZONS加入一次；总长分别5/10/5，前4次强制，故自由选择分别1/6/1。Wilson2014原协议为320局（4×80），短/长各160；此处3局远非原协议。
- **刺激**：左右两个奖赏机器，选择/反馈历史留在屏幕。源码horizon=5或10含强制采样；文献horizon=1或6只计自由选择，字段须分开。强制[1,3]或[2,2]信息分配。
- **响应**：左右箭头；前4步只接受指定侧键，自由步接受两侧，禁止持有键重复。每局结束汇总点数后500ms开放任意键进入下一局。
- **时序与截止**：plugin choice_duration默认null，即无选择截止。若非null，计时器仅在首步设置，after_response清理全部定时器但未为后续步重设；不能声称每步同一deadline。超时显示5秒警告并结束该局。
- **奖励轨迹**：demo用自定义gaussianRandom、向下取整、最低0分，未限制最高100；原文用1–100整数奖励、SD=8、均值差4/8/12/20/30并平衡设计。不能把函数名称当作已核验正态生成器或原协议等效。
- **必要原始字段**：必须有game ID、horizon_total/free、forced_choices、信息条件、每臂全部奖励队列和生成均值、每步choice/RT/outcome、first-free标记、超时/未完成、seed。plugin输出包含奖励队列/键/RT/结果但未显式存forced_choices；需从冻结manifest补全。

## 计分

- **描述指标**：按horizon和信息条件报告首个自由选择选择“较少采样侧”的比例，并联合观察两侧已见平均收益差；不要把低收益选择一律判错。
- **模型指标**：Wilson原文首个自由选择的logistic模型区分信息bonus、空间偏向与噪声，比较长短horizon；只有完整平衡设计、足够试次且参数可恢复时才讨论模型参数。当前demo不含此拟合。
- **方向/解释**：更多信息探索不总是更好；长前景探索可能有将来收益，短前景任务不同。累计点数受随机奖励轨迹影响。
- **不应出分情形**：3局demo不足以支持可靠个体探索参数；条件缺失、强制历史丢失或模型失败时不产生能力分。

## 四类规则（不可混用）

### 技术质量规则
- 核奖励队列长度等于总步数，前4步强制条件齐全；保存实际manifest和每步计时。
- screen_resolution只标记至少300×400，不是完整设备有效性验证；交互日志不等于自动失焦剔除。deadline重设和forced_choices漏存为静态发现，未运行复现。

### 理论参照
- 在首个自由选择比较horizon与信息量，有助于区分信息bonus和决策噪声；后续自由选择信息量与收益会再次相关，不可不加条件混合解释。

### 文献经验
- Wilson2014将全程表现未显著优于随机（p=.01标准）的参与者排除；这是原320局研究的分析规则，不应搬到3局demo或儿童任务。
- 文献没有提供本项目个人探索能力等级、正常范围或最短有效局数。

### 项目暂定研究者规则
- 计划优先按原文构造平衡trial manifest，预先区分首个自由选择与后续选择；局数缩短需先做可靠性/参数恢复。未设置具体通过阈值。
- 新实现应明确到底自定时还是每步deadline，后者属于协议改版而非无损技术替换。

## 反馈边界

- **可说**：在只剩 1 次自由选择时，你在 {短前景有效首选次数} 次中有 {短前景较少信息侧次数} 次选择先前了解较少的一侧；还可选 6 次时，对应为 {长前景较少信息侧次数}/{长前景有效首选次数}。这里只描述这次选择，不评价哪种偏好更好。
- **不可说**：“你探索力80分／天生敢冒险”；“赚得少说明你不会决策”；“3局即可测出随机探索能力”。
- **受限时**：部分强制采样或奖励记录缺失，无法公平比较两种机会条件；不输出探索倾向或模型结论。
- **无效时**：本次有效记录不足或关键流程不完整，暂不提供表现结论。
- **使用条件**：以上可解释示例必须由实际指标及质量状态支持；方向相反时按实际写，不能支持差异时只列记录，不预设结果或声称等效。


## 版权路线（与实现策略分轴）

- 第一类仅限合规条件：CC BY-NC-SA 4.0可依署名、非商业和相同方式共享公开；本项目用途未获NC适配确认，不默认获准商业/产品复制。
- 示例图像/字体逐件来源未核；第三类待核。优先自行绘制抽象机器，文献事实不等同可复制论文图。
- 当前自写摘要和固定链接可公开，不包含上游代码或论文配图。

## 三种实现策略

- **代码适配**：只有项目用途符合NC-SA或取得额外授权后才考虑；仍需补完整设计、计时和数据。
- **文献自研**：首选：按Wilson设计思想写独立实现与自绘素材，明确与原版差异。
- **暂缓**：原demo直接接入、3局估计个体参数、把点数映射0–100。

## 精确缺口

- 完整320局或经验证替代设计及奖励生成清单未具备。
- choice_duration后续未重设、forced_choices未存是两项实质工程缺口。
- 原始paper的指标需另实现/验证，不从平均收益替代。
- NC-SA适用性、理解题重试策略与最小数据量未决定。

## 证据

1. [tasks/horizons/README.md](https://github.com/nivlab/jspsych-demos/blob/a819c4cae29e629508847a0abe5cd1e5e36baa42/tasks/horizons/README.md) — 明确要求使用者提供完整trial list及Wilson引用
2. [tasks/horizons/experiment.html](https://github.com/nivlab/jspsych-demos/blob/a819c4cae29e629508847a0abe5cd1e5e36baa42/tasks/horizons/experiment.html) — 仅加入一次3局HORIZONS
3. [tasks/horizons/js/horizons-experiment.js](https://github.com/nivlab/jspsych-demos/blob/a819c4cae29e629508847a0abe5cd1e5e36baa42/tasks/horizons/js/horizons-experiment.js) — 3局、奖励生成和强制序列
4. [tasks/horizons/js/plugin-horizons-trial.js](https://github.com/nivlab/jspsych-demos/blob/a819c4cae29e629508847a0abe5cd1e5e36baa42/tasks/horizons/js/plugin-horizons-trial.js) — 响应、deadline生命周期和缺少forced_choices输出
5. [tasks/horizons/js/plugin-horizons-comprehension.js](https://github.com/nivlab/jspsych-demos/blob/a819c4cae29e629508847a0abe5cd1e5e36baa42/tasks/horizons/js/plugin-horizons-comprehension.js) — 3题理解检查输出
6. [LICENSE](https://github.com/nivlab/jspsych-demos/blob/a819c4cae29e629508847a0abe5cd1e5e36baa42/LICENSE) — CC BY-NC-SA4.0，沿用首轮实核
7. [Wilson et al. 2014，原始Horizon论文](https://worthylab.org/wp-content/uploads/2020/12/wilsonetal_2014_jepgeneral_exploration.pdf) — 320局、强制采样、奖励设计、首自由选择模型及原研究排除；doi:10.1037/a0038199


---

<a id="two-stage-learning"></a>

# 两阶段强化学习：Experiment Factory 2秒成人变式

**方向：MIT状态机/数据逻辑适配候选；模型分析与协议验收前暂缓接入**

- 构念：比较过去奖赏及常见/罕见转移如何共同影响下一次第一阶段选择。研究中用来分析model-based与model-free影响；不是直接测量一个固定“理性/习惯人格”。
- 固定版本：`expfactory-experiments/two-stage-decision@19f1ff59c61157f8b8b5f3706689ea344baf0603`
- 状态：固定快照静态协议候选；未运行、未移植、未入库、未实测时序
- 常模边界：无本项目、本地年龄/语言/设备常模；无个体诊断阈值；不生成0–100综合分

## 协议与原始数据

- **练习**：1个教学示例，加50个练习trial；练习与正式换刺激。attention checks默认false，不能称已启用质量保障。
- **正式**：200正式trial，100+100两段；不是Daw2011原始201 trial（3×67）的逐项复现。config估时26分钟仅为上游元数据。
- **刺激**：第一阶段两个抽象符号；选择后以70%常见或30%罕见转移到两个第二阶段状态之一，各再有两个符号。左右位置随机化，符号identity不可用按键side替代。
- **响应**：左右箭头选择；第一、第二阶段均2000ms，反应结束当前选择阶段；缺失用−1。选择动画各1000ms，奖赏反馈500ms，ITI 1000ms。首次漏答关闭反馈路径；各阶段缺失应分开记录。
- **奖励轨迹**：第二阶段四个选择的奖赏概率初始0.25–0.75，Gaussian SD=.025随机游走并反射边界。奖励1/0；源码仅有效第二阶段选择后更新概率。FB_probs在update_FB之后保存，不能误称当前实际抽奖前概率。
- **必要原始字段**：phase、trial_num、stage、stimulus identity与side、choice、RT、stage_transition、reward、pre/post reward probabilities、完整概率/转移序列、miss stage、seed；按phase+trial_num关联多行stage记录。

## 计分

- **描述指标**：按前一trial奖励/未奖励×常见/罕见四格统计下一trial保持同一第一阶段stimulus identity的比例，报告每格分母、遗漏与转移频率。累计奖励另列纯任务收益。
- **模型指标**：Daw原研究以stay/switch logistic分析reward、transition及交互，并另拟合混合RL模型。交互是与model-based影响一致的模式，仍依赖正确任务模型与学习假设；本源码没有对应拟合器。
- **方向/解释**：收益高低不能单独代表model-based程度；保持/切换并无统一越高越好方向。混合模型w是模型参数，不是个人规划能力百分比。
- **不应出分情形**：相邻trial缺失、阶段关联错误或四格数据不足时对应统计/模型不报告；不能将缺失奖励直接当真实0奖励。上游performance_var在credit失败时设0，项目不沿用其“无效等于0分”语义。

## 四类规则（不可混用）

### 技术质量规则
- 核phase/trial关联、stimulus identity与位置、时钟和转移/奖励轨迹；FB_probs更新前后语义必须可追溯。
- Math.random无可追溯seed；legacy全局变量、缺失路径和旧插件需静态之外的测试。未执行上游代码或CI。

### 理论参照
- reward×transition交互与前瞻性模型使用相符；reward主效应与model-free影响相符，但模型误表征、持续选择等也会影响模式。并非诊断二分法。

### 文献经验
- 上游assessPerformance的credit_var要求missed比例<.40、有效RT中位数>200ms、无任一按键计数>85%；是上游credit筛选，且聚合扫描响应型trial，并非只取正式两阶段试次的预注册个体阈值。
- Daw原文2秒响应和50练习可追溯，但其研究样本/参数分布不是本项目常模；没有个体model-based高低正常界值。

### 项目暂定研究者规则
- 当前仅候选描述统计＋模型研究，先补分析contract与参数恢复。四格最少有效trial、遗漏容忍度、重测可靠性标准均未设定。
- 不得为legacy必需score造奖励比例×100或把无效填0；缺失/负差值指标接入需求登记给平台分工356。

## 反馈边界

- **可说**：本次完成了 {有效两阶段次数} 次两阶段选择。不同转移和奖励情况下，你重复上次选择的次数见下表；累计奖励只说明本次得到多少奖励，不代表某一种学习能力。
- **不可说**：“你是70%理性、30%习惯”；“奖励少说明计划能力差／容易成瘾”；“交互不显著证明没有model-based学习”。
- **受限时**：部分阶段或转移记录不能配对，相应重复选择比例和模型结果暂不解释。
- **无效时**：本次有效记录不足或关键流程不完整，暂不提供表现结论。
- **使用条件**：以上可解释示例必须由实际指标及质量状态支持；方向相反时按实际写，不能支持差异时只列记录，不预设结果或声称等效。


## 版权路线（与实现策略分轴）

- 第一类：MIT代码依保留版权/许可可公开与适配；旧依赖逐件保留许可。
- 符号/金币图未查得逐素材完整授权链，第三类待核；优先自行绘制不复用上游图像。
- 自写协议与链接可公开，不附完整experiment.js、图片或参与者数据。

## 三种实现策略

- **代码适配**：优先取状态机和stage字段思想/许可允许代码片段，必须修补概率记录与缺失语义。
- **文献自研**：可依Daw论文完整独立实现；如选儿童3秒/Hartley版本须另开版本，不能混用此2秒版证据。
- **暂缓**：未经拟合验证的model-based个体报告、奖励总数当构念分、原legacy runtime直接部署。

## 精确缺口

- 固定200正式而非201原文，冻结反馈/ITI/失答处理和奖励轨迹更新规则。
- 概率日志是更新后值；研究回放需增加pre-update概率或可验证重构。
- 模型实现、参数恢复、收敛/区间、足量trial与可靠性未核验。
- 刺激授权和浏览器技术QC缺失；全部待非编码研究验收后再决定。

## 证据

1. [experiment.js](https://github.com/expfactory-experiments/two-stage-decision/blob/19f1ff59c61157f8b8b5f3706689ea344baf0603/experiment.js) — 50+200、2秒、70/30、概率轨迹、credit与多行原始数据
2. [config.json](https://github.com/expfactory-experiments/two-stage-decision/blob/19f1ff59c61157f8b8b5f3706689ea344baf0603/config.json) — Daw原文lineage与估时
3. [LICENSE](https://github.com/expfactory-experiments/two-stage-decision/blob/19f1ff59c61157f8b8b5f3706689ea344baf0603/LICENSE) — MIT
4. [Daw et al.2011原论文](https://gershmanlab.com/pubs/Daw11.pdf) — 201正式、50练习、两阶段范式、stay模型与混合RL；doi:10.1016/j.neuron.2011.02.027


---

<a id="balloon-effort"></a>

# 气球努力选择：50/100/200按压与比例奖赏版

**方向：MIT配置/状态逻辑适配候选；先冻结72试次实验室版本与6秒源码截止**

- 构念：在奖励概率、奖励大小、按压要求变化时，在低努力与高努力间选择。选择意愿与随后实际执行分别测量；不是BART爆破风险任务，也不能推断懒惰、意志力或精神障碍。
- 固定版本：`lnccbrown/task-effort@8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba`
- 状态：固定快照静态协议候选；未运行、未移植、未入库、未实测时序
- 常模边界：无本项目、本地年龄/语言/设备常模；无个体诊断阈值；不生成0–100综合分

## 协议与原始数据

- **练习**：配置3段各默认1次：低努力20按/1点；高努力200按/5点；概率50%的真实选择练习。随后理解题，配置max_attempts=5；本轮未完整审quiz循环，不能声称固定只练3次或正确率达标已验证。练习choice把duration设为5000000ms，并非严格无限时。
- **正式**：默认含概率100%/50%，高努力3个水平50/100/200，奖励3/5/7，左右counterbalance；生成4×3×3×2=72次。ONLINE且get_subset=true时shuffle后截54次，不保证每条件完全平衡；remove-probability另为36次全概率100%变式。本卡优先72次，不混同54/36。
- **刺激**：两个气球与尖刺，低努力20按/1点；高努力按压目标和点数独立交叉。图形Canvas绘制，非随时爆炸的风险决策。
- **响应**：Q/P选择对应侧并继续按所选气球键；只计所选侧有效键，allow_held_key=false。m有实验者控制用途，不应作为普通反应。
- **时序与截止**：taskTrial.js正式choice(6000)，不是论文6.5秒；选择前概率1000ms，实验室版另显示frame700ms和cost-benefit1500ms，在线版省略后二项。执行计时25秒，50ms轮询。首个pump又重置timeWhenStarted，因此首次等待与随后RT基准/25秒窗须核验，不能直接宣称从选择时刻起严格25秒。
- **奖励轨迹**：高努力且预排get_reward=true：点数=offer points×实际按压/目标按压，保留2位小数，允许超目标获得更多而非封顶；get_reward=false为0。低努力成功给1点、超时0，无部分/额外点。概率通过平衡预排布尔结果实现，不是每次独立掷硬币。
- **必要原始字段**：每trial完整offer与左右布局、probability、预排get_reward、choice/high_effort、choice RT、每次pump RT、first/last press、count、计时原点、timeout/none、兑现点数、condition manifest、seed与ONLINE/overload版本。

## 计分

- **描述指标**：按奖励×目标努力×概率分层报告高努力选择率及有效选择分母；执行按压数/按压速率、超时、实际奖励另列，不混成一个动力分。
- **模型指标**：Culbreth2024使用频率及层级logistic模型研究奖励、努力、概率对选择的贡献；此代码不直接提供经验证模型评分。
- **方向/解释**：高努力选择多不必然更好；奖励价值、身体舒适、疲劳、键盘和时间成本都能影响选择。奖励总量同时混合策略、运动速度及概率实现。
- **不应出分情形**：未作有效选择须独立缺失，不能算低努力；按键/计时异常时不计算执行速率；若某条件被随机截掉，不对该条件补0。

## 四类规则（不可混用）

### 技术质量规则
- 核offer、预排奖励、选择和执行的数据链接；长按自动重复不可计入独立努力，计时基准要统一。
- 源码choice6秒、首pump重置及Date.now是静态事实；实际浏览器时间行为尚未测。72/54/36版本都应单列manifest。

### 理论参照
- 选择反映努力与预期收益的取舍；努力选择与实际执行分离。某个选择率高低无普遍最优值、无“动力正常线”。

### 文献经验
- 直接匹配50/100/200及比例奖赏的一手研究为Culbreth等2024，72试次，论文选择窗6.5秒，与当前SHA的6秒不一致。旧CNTRACS README的100/120/150以及Reddy2015的10/100不是本版。
- Culbreth研究排除单一选项>85%的inflexible responders；这是该样本分析经验，不能把稳定偏好自动视为欺骗或动力异常。

### 项目暂定研究者规则
- 先登记源码6秒与论文6.5秒差异，再决定忠实复现或明确改版；本轮不选混合版。
- 本项目不直接沿用85%自动判无效；先以理解测试、数据完整性和设备/手部适用性核查。没有新设个人高低阈值。

## 反馈边界

- **可说**：不同奖励和按压要求下，你选择较多按压选项的次数分别为 {条件选择次数及分母}。实际按压速度和超时另列；这些选择不用于评价是否勤奋。
- **不可说**：“你很懒／动力不足／有抑郁倾向”；“赚到的总点数就是意志力”；“选低努力一定不理性”。
- **受限时**：部分选择或按压时间记录不完整，相应条件不作比较；未作选择不能当作选择低努力。
- **无效时**：本次有效记录不足或关键流程不完整，暂不提供表现结论。
- **使用条件**：以上可解释示例必须由实际指标及质量状态支持；方向相反时按实际写，不能支持差异时只列记录，不预设结果或声称等效。


## 版权路线（与实现策略分轴）

- 第一类：MIT代码可依保留版权/许可公开和适配；不随任务带入机构后端、品牌或账号配置。
- 核心可自行Canvas绘制。Brown品牌图标及未核第三方素材第三类待核，不能由根MIT推定可使用标识。
- 仅摘要/链接，不含完整React应用、后端配置或原参与者资料。

## 三种实现策略

- **代码适配**：优先配置和纯状态逻辑；必须隔离Electron/机构保存层、冻结时钟/奖励语义并验证。
- **文献自研**：可据2024版从头实现自绘任务；若采用6.5秒，应明确不是当前SHA完全等效。
- **暂缓**：作为学校儿童动力筛查、给人格/临床标签、54次线上版直接套72次原研究证据。

## 精确缺口

- 正式6秒与文献6.5秒、25秒计时原点及在线省略阶段需决策。
- 高努力按压过目标仍可得更多，需在说明与评分一致表达。
- 54次随机子集的平衡与重复测量可靠性未获证据；练习quiz循环未全审。
- 年龄/运动/设备与语言适用性、数据持久化及随机重放待验证。

## 证据

1. [src/config/experiment.js](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/config/experiment.js) — 50/100/200、3/5/7、概率与overload
2. [src/config/practice.js](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/config/practice.js) — 三段练习及max_attempts配置
3. [src/config/main.js](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/config/main.js) — default repeats、25秒
4. [src/lib/taskUtils.js](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/lib/taskUtils.js) — 72生成、54截取、原始字段
5. [src/timelines/taskTrial.js](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/timelines/taskTrial.js) — 6秒选择与在线/实验室阶段差异
6. [src/trials/choice.js](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/trials/choice.js) — 响应、练习时长与超时
7. [src/trials/pressBalloon.js](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/trials/pressBalloon.js) — 首pump重置、25秒、比例奖励与重复键
8. [src/timelines/main.js](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/timelines/main.js) — 练习和正式编排
9. [LICENSE](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/LICENSE) — MIT
10. [Culbreth et al.2024：匹配变式原研究](https://bpb-us-e2.wpmucdn.com/sites.wustl.edu/dist/1/1008/files/2024/03/2024CulbrethSB-b3ea7d0b08b2572c.pdf) — 72、6.5秒、25秒、比例奖赏及>85%研究排除；doi:10.1093/schbul/sbad155


---

<a id="metacognitive-confidence"></a>

# 语义判断后的信心：GDP/食物双条件阶梯版

**方向：MIT两阶段响应逻辑适配候选；材料权利和模型研究先行**

- 构念：先做客观两选一判断，再报告自己认为答对的信心。分别衡量一阶正确性、信心偏向和信心区分正确/错误的能力；平均信心只是使用高低信心的倾向，不是元认知能力。
- 固定版本：`embodied-computation-group/dg-metacognition@0c38aba4eb720a143d126b7c7d4c313a900bc536`
- 状态：固定快照静态协议候选；未运行、未移植、未入库、未实测时序
- 常模边界：无本项目、本地年龄/语言/设备常模；无个体诊断阈值；不生成0–100综合分

## 协议与原始数据

- **练习**：triviaWrapper：20次练习，有正确性反馈并收信心；随后正式重置结果和阶梯。
- **正式**：参数5block×40=200总trial，双条件GDP/食物。论文报告各100；但runBlock每block重新Shuffle长度200的条件向量，再按跨block累计trial_counter取其中片段，不能由参数名保证实际恰各100，须保存/核实际WhichCondition。
- **刺激**：GDP比较两个国家的2010–2017平均人均GDP（源码文字）；食物比较热量。GDP阶梯差值用log GDP，初始1，界0.1–5，步长.5/.25/.125；食物初始200cal，界1–500，步长100/50/25。不能悄悄换成当年GDP或当地食物后沿用效度。
- **响应**：左右箭头作第一阶判断，无决策deadline；之后左右箭头移动7档信心，空格确认。信心光标随机起点，70ms轮询。
- **时序与截止**：p.Stimtime=.25实际是选择后标记保留250ms，不是刺激仅呈现250ms。信心4秒截止；超时conf/RT=NaN并反馈Too late 250ms。决策RT从Flip起以ms返回，信心RT以秒返回且计时起点在首次绘制之前；需保留阶段/单位差别。
- **阶梯**：每条件2-down1-up；正确/错误和反转更新阶梯。论文长期目标约71%正确仅为设计目标，不是通过线。条件表/试次难度和实际pair都需记录以便重放。
- **必要原始字段**：block/trial、condition、pair IDs与事实版本、目标差/实际差、左右位置、choice、correct、decision_rt_ms、confidence_raw_0_to_1、confidence_bin_1_to_7、confidence_rt_s、确认/超时、staircase state/reversals/step、seed。

## 计分

- **描述指标**：按条件分开正确率、d′（若冻结对应SDT编码）、平均信心及正确/错误分层信心。UI为1–7但collectConfidenceDiscrete返回0–1等距7点；应显式转换bin=1+6×raw，并保留原值，不把0误当漏答。
- **模型指标**：研究用MLE meta-d′和层级HMeta-d评估meta-d′/d′（M-ratio）。本轮只审任务关键路径，未验证完整模型实现；层级模型个体后验会向组均值收缩，不拿图上的个体点作稳定个人排名。
- **方向/解释**：高平均信心不等于更能识别自己何时答错。元认知效率须考虑一阶表现、置信区间、模型与题材；不把知识多误称监控能力强。
- **不应出分情形**：信心无变化、正确/错误单元为空、d′接近0或拟合不稳定时不可报告有解释性的M-ratio；仅在明确预注册分析允许时报告相应区间/缺失。不得把NaN换0。

## 四类规则（不可混用）

### 技术质量规则
- 区分1–7显示与0–1储存，决策ms与信心s；保留未确认信心、4秒超时及随机光标起点。
- 核pair排序事实与左右正确键，防键持有跨阶段误响应；实现有KbCheck轮询，未见统一browser失焦/键释放策略。
- 实际条件数可能非100/100；以保存的WhichCondition核，不根据参数名字推断平衡。

### 理论参照
- 2-down1-up约71%是阶梯理论目标，不是能力标准。meta-d′/d′需特定SDT建模；mean confidence只描述偏向，不能替代meta能力。

### 文献经验
- Lund2023作者稿的预处理：RT<50ms或MAD异常trial剔除；某域完成<50%则排除该域；信心不变导致模型不可估、以及若干参数MAD异常另处理。具体MAD数值阈值本轮未从分析实现核定，明确不补写。
- 原文为成年英语参与者的跨域研究，未提供本项目学校/中文儿童个人常模或诊断界值。

### 项目暂定研究者规则
- 先呈现正确/错误分层信心和有效数；模型指标只有经恢复/可靠性/尺度转换验证才启用。M-ratio近零d′处理阈值、最小trial数未定，不自行发明。
- 新图/中文知识材料、重新校准事实或延长4秒窗口都应单列变式。尊重完成困难，不以低信心给人格标签。

## 反馈边界

- **可说**：本次答对时的平均信心为 {答对平均信心}，答错时为 {答错平均信心}，有效记录数分别为 {答对有效数} 和 {答错有效数}。信心高低与能否分辨自己的对错是两回事，只描述这一组问题。
- **不可说**：“平均信心6分证明元认知优秀／自知之明差”；“知识题答对多就代表元认知好”；“M-ratio=1.2说明超越120%的人”。
- **受限时**：部分信心未确认或记录不足，相关条件暂不比较；不把缺失信心补成最低分，也不输出不稳定的模型比值。
- **无效时**：本次有效记录不足或关键流程不完整，暂不提供表现结论。
- **使用条件**：以上可解释示例必须由实际指标及质量状态支持；方向相反时按实际写，不能支持差异时只列记录，不预设结果或声称等效。


## 版权路线（与实现策略分轴）

- 第一类：MIT代码保留版权/许可可公开与适配；嵌入旧函数需逐件保留来源。
- 国家旗帜、食物图和事实表不可由MIT概括；论文指出Full4Health图像来源，但本轮未核该资产许可，仍第三类待核/待授权。GDP2010–2017事实来源及数据权利需单独记录。
- 仅自写协议、公式概述和链接，不附原始/汇总参与者数据、旗帜/食品库或论文图。

## 三种实现策略

- **代码适配**：可优先取choice→confidence、阶梯和raw契约，但需修尺度/时钟/缺失与平衡审计。
- **文献自研**：若材料不可用，可依论文思想用获权、自建题材；必须重新验证难度与构念等效，不直接沿用结论。
- **暂缓**：平均信心自动标签、未经验证meta模型个体分、把英文GDP知识版直接用于儿童诊断。

## 精确缺口

- 收信心尺度与单位混用是实质接入风险；需按阶段统一而保留原值。
- runBlock重建条件向量使精确100/100有疑点，待独立设计核验，不在本轮改上游。
- 素材许可、事实年代和跨语言适用性；论文文字与源码GDP时间窗口不完全相同。
- MAD具体阈值、模型库版本/许可、收敛诊断及个体可靠性待核；不发布模型能力分。

## 证据

1. [tasks/metacognition_battery/trivia_task/taskcode/runtask/triviaGetParams.m](https://github.com/embodied-computation-group/dg-metacognition/blob/0c38aba4eb720a143d126b7c7d4c313a900bc536/tasks/metacognition_battery/trivia_task/taskcode/runtask/triviaGetParams.m) — 20练习、200正式、阶梯、4秒信心
2. [tasks/metacognition_battery/trivia_task/taskcode/runtask/triviaWrapper.m](https://github.com/embodied-computation-group/dg-metacognition/blob/0c38aba4eb720a143d126b7c7d4c313a900bc536/tasks/metacognition_battery/trivia_task/taskcode/runtask/triviaWrapper.m) — 练习反馈、正式重置/无反馈
3. [tasks/metacognition_battery/trivia_task/taskcode/runtask/runTrial.m](https://github.com/embodied-computation-group/dg-metacognition/blob/0c38aba4eb720a143d126b7c7d4c313a900bc536/tasks/metacognition_battery/trivia_task/taskcode/runtask/runTrial.m) — 不限时决策、250ms真正位置、ms单位
4. [tasks/metacognition_battery/trivia_task/taskcode/runtask/collectConfidenceDiscrete.m](https://github.com/embodied-computation-group/dg-metacognition/blob/0c38aba4eb720a143d126b7c7d4c313a900bc536/tasks/metacognition_battery/trivia_task/taskcode/runtask/collectConfidenceDiscrete.m) — 1–7显示/0–1输出、4s NaN、信心RT秒
5. [tasks/metacognition_battery/trivia_task/taskcode/runtask/runBlock.m](https://github.com/embodied-computation-group/dg-metacognition/blob/0c38aba4eb720a143d126b7c7d4c313a900bc536/tasks/metacognition_battery/trivia_task/taskcode/runtask/runBlock.m) — 条件向量重建、阶梯状态、原始输出
6. [tasks/metacognition_battery/trivia_task/taskcode/runtask/UpdateStaircase.m](https://github.com/embodied-computation-group/dg-metacognition/blob/0c38aba4eb720a143d126b7c7d4c313a900bc536/tasks/metacognition_battery/trivia_task/taskcode/runtask/UpdateStaircase.m) — 2-down1-up边界/反转
7. [LICENSE](https://github.com/embodied-computation-group/dg-metacognition/blob/0c38aba4eb720a143d126b7c7d4c313a900bc536/LICENSE) — MIT
8. [Lund et al.2023作者稿：Domain-Generality in Metacognitive Ability](https://discovery.ucl.ac.uk/10209468/3/Fleming_DGM_Prereg_Review_final.pdf) — 各100语义trial、预处理、meta-d′/d′与mean-confidence区分；稿本页8–10，非本地常模
