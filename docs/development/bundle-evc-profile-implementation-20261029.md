# EVC 理论 Bundle：实施与验收设计（2026-10-29）

状态：设计，自审完成；尚未实现、安装、正式 CI、合并或部署。执行仅在独立云端，禁止访问生产数据库。分支 `feat/bundle-evc-profile-20261029`。

## 1. 精确来源与当前事实

- 回读远端 main = `2de32609e1888cf28b73cb26e2c0cf38b11ff875`；开始时 tracked/index 干净。已读根 AGENTS、release README 的适用规则、现有唯一认知 intake skill（本功能不新增认知任务，故不套用认知入库验收）。
- 实读原 Notion 总页、00—09、01-B/02-B/03-B/04-B。保留原目录，不建新 hub。来源总页：https://app.notion.com/p/408d27635a388118b8f7c6791c741aa6 ；模型补遗：https://app.notion.com/p/408d27635a38811d9f87c972661d2538 。
- 05 源码 Markdown 下载 SHA256 = `d6583c15ae4e6de3e88a42d51c09f4aa588aced07dd38c6e064b723f7c1c01e0`，吻合原页。安全恢复 38 个相对路径文件；逐文件 SHA256 全部吻合，共 144088 字节（页面概述称149913；不以概述代替字节证据）。无绝对路径、父目录穿越、命令执行。原引擎 SHA256 = `cd7d0d7ae7a5ceeaa0bb0210f4c53933eb9bad0d1cf7c25bba99bf1b6322d9e7`。没有取得/声称取得 ZIP、dist 或历史42测试日志。
- Library `libfile_5e67911378bc8191a1d9dc82d9abc516` 按当前技能物化；文件 Pasted text(5).txt = 15998 字节，SHA256 `ebb0cd05da912f14d8fc872d7846baa062d4249d1b647895555ba7b25d89763e`。这是交付说明，旧 NOT_SYNCHRONIZED 不覆盖当前 Notion 状态。
- P6 远端实读 head = `5480b5c9f631d216eb845795f98bf0e43662b0fb`。该分支三点 diff 有多个 merge base，包含175路径的其他历史工作，不全量合并。直接比较 main 与 head 的 package-reference 文件，仅有整包目录/授权预览/读取，无真实执行闭环。其独立 `instantiateBundleStructure` 可作为薄适配参考，但不得因此声称四入口已支持 EVC。

## 2. 产品与模型决定

普通 COMBINATION 保持独立计分、独立报告。Bundle 另有专家预定义的跨工具指标子集及组合解释；单项 FINAL 报告继续保留。系统不在线拟合 LPA，不逐人调用 LLM，不构造动机总分。

| 项目 | 候选 A（保留） | 本次优先接入的独立候选 B |
|---|---|---|
| 模型身份 | math-evc-theory@1.0.0-proposal.1 | learning_motivation_math_support@0.1.0 |
| 方法 | 规则主判＋加权RMS对照 | 硬规则守卫＋加权L1 |
| 界限 | RMS半径.28、距离差.06 | 绝对匹配至少75，首二分差至少8 |
| 人群 | 建议7—9年级 | 原参考7—12年级，数学SELF |
| 编号 | 低E高V高C编号不同 | P4=低E、高V、高C |
| 成熟度 | 理论候选 | EXPERIMENTAL；无真实类别验证 |

采用依据：委托要求优先复用B参考实现；有精确可校验源码、六型、拒判规则、固定中文文案及12例。作为独立研究候选集成，不替代A、不平均阈值、不改年龄或科学身份。已提出唯一专家决策：是否冻结B为首个可安装试验示范；未答前通用集成继续，正式示范身份保持待决。代码合入不等于科学批准、DB发布或生产上线。

B参数保持原值：三轴等权；低<=.35，高>=.65；低/高中心.2/.8；模糊节点.25/.5/.75；加权平均绝对距离 d，匹配=100*(1-d)，绝对拒判优先于分差；全精度计算，显示才舍入。六型为 HHL、HHH、LHL、LHH、HLL、LLH；LLL/HLH明确未覆盖。

## 3. 核对过的数据映射与三轴版本

| 构念 | 精确单项/指标 | 原分与方向 | 转换/要求 |
|---|---|---|---|
| math.academic_self_efficacy | academic_self_efficacy_mathematics_zh_cn@1.0.0 / academic_self_efficacy | 5题，1—5，越高越有把握；保留下学期题干 | (raw-1)/4；核心要求完整且可解释 |
| math.importance_utility_value | value_cost_mathematics_zh_cn@1.0.0 / value | 3题，1—6，重要性/用途，不能写兴趣 | (raw-1)/5；完整且可解释 |
| math.time_opportunity_cost | 同VC / cost | 4题，1—6，越高时间/取舍负担越高 | (raw-1)/5；不反向，不称情绪成本 |

源blob须与实际文件核验；Git blob只作来源，不作运行 measurementHash。生产映射固定实际 measurement 内容hash、scoringVersion、语言版本及来源版本。E/VC原 scorer 的 calculated 语义要求该分量表完整，缺答为limited/not_calculable；优先复用这一契约，避免为本功能改变共享单项计分/CanonicalUnitResult schema。若核心完整性不能由现有协议证明，输出INSUFFICIENT，不伪造expected/answered。

版本分别固定：Bundle定义C=0.1.0；模型/映射/参数P=0.1.0（算法 weighted-l1-guarded-v1）；中文模板R=0.1.0；引擎 declarative-evidence-v1@1.1.0；onboarding package schema=2；外层 FrozenBundleProductionDefinition schema2、Bundle Snapshot V3均保留。单项 C/P/R 不变（instrument/scoring/localization1.0.0，既有report1.1.0）。

坐标只为理论范围位置，不是百分位、常模分、能力、心理等距或等值转换。参考版本无统计后验概率。现有原始反向题由单项计分一次；Bundle只对已冻结维度做显式方向转换。本例两工具无反向项。

## 4. 当前能力、缺口与最小实现

已实读：onboarding contract/loader/engine/catalog/dependencies/fixtures、definition-provider、report-facts、sources、analysis、service/runtime、BundleReport；Survey governed-package.reports；P6整包文件。

| 能力 | 已有可复用 | 本次扩展 |
|---|---|---|
| 定义与生命周期 | package严格解析、安装/独立签名审核/发布/HOLD/RETIRED | package2联合分支，保留package1原解析与原hash |
| 冻结 | 完整declarativePackage已纳入contentHash/freezeHash | Profile/映射/文本放入包内，不用可变外部URL |
| 单项 | durable FINAL、Canonical bridge、source hashes、已有质量 | Bundle侧最小来源身份投影；不读原答案重计分 |
| 算法 | 三值条件、固定文本和supportRefs | 有界Profile子内核、拒判、辅助规则 |
| 持久化 | INITIAL唯一身份、PENDING/FAILED、加密facts及hash、显式重分析 | 同一结果保存Profile payload；重开只读，不在线匹配 |
| 受众 | admission冻结policy与source交集 | Profile专用白名单，按依赖源分别抑制解释、标签、数值、教育行动 |
| UI | 共用ReportPrimitives、单项报告现有链 | 中文摘要、原量尺小图/表、状态、行动（有权时）、版本/方法详情 |
| 存储 | 定义共享不可变、结果加密；不默认PDF/图片归档 | 不新增每用户题本/统计服务/报表系统 |

新增目标目录：`assessment-bundle/profile/{contract,match,report}.ts`。
修改目标：`assessment-bundle/onboarding/{contract,engine,loader,fixtures,dependencies}.ts`、`bootstrap.ts`、`sources.ts`、`bundle-product/analysis.ts`、`BundleReport.tsx`；新增版本内容包、针对测试及文档。definition-provider保持现有外层hash，不改变生命周期。声明式旧引擎1.0.0不接受package2，1.1.0只接受精确Profile契约。

同引擎族，不建第二种Bundle runtime。strict schema限定<=10核心、<=8原型、<=6辅助修饰；有界字节/深度、唯一construct/来源指标/contributionGroup、正权重、中心与pattern一致、完整provenance与reference引用。辅助只能根据自己的有效来源触发，缺失/invalid为unknown，不改变主画像；示范12题版不加入尚无精确绑定的辅助量表，不写required:false绕过非FORM约束。

## 5. 与任务1的接口边界

不联系任务1对话，不改其C/P/R授权核心、管理员分配UI或另建权限体系。只消费现有精确release、冻结snapshot及实际admission policy。

必要Bundle内部最小输入/输出：
- `sources.ts`：从已验证Canonical envelope/core生成可选来源身份（sourceDefinitionHash、scorerVersion、sourceAttemptId等），供新Profile精确匹配；旧消费者和旧hash不强加新字段。
- `profile/report.ts`：输入已存Profile payload、冻结包和服务端逐slot披露能力；输出版本化ProfileView白名单。完整候选/型名/原型中心和行动不得在WITHHELD响应出现。
- `analysis.ts`：仍用原readReport身份授权和原policy resolver，在同一GET里附上投影；不在前端推断权限，不新增researcher公开路由（当前admin映射researcher，教师teacher，学生subject，家长respondent）。
- 不预先修改CanonicalUnitResult、ScaleResult或公共授权类型。若后续发现必须改这些共享文件，先由DOT协调明确文件/输入输出，再动共享接口；独立内核与内容包继续。

## 6. 报告、权限与失败状态

学生页先给“这次回答”的暂定组合，再原量尺E/V/C图和等价文字表。三轴各自量尺，不用雷达面积/综合分/红绿好坏。MATCHED显示一型；MIXED显示共同事实与两种接近解释；BOUNDARY、UNCLASSIFIED不硬选；INSUFFICIENT/INVALID/NOT_APPLICABLE各有明确中文。源报告入口沿已有单项卡，真实URL由原消费者提供，不伪造离线链接。

当前核心源：subject/respondent允许个体解释和派生标签；teacher/researcher不允许。所有视图仍按真实关系和现有鉴权。numericScores=false时数值/图/匹配分全部抑制；individualInterpretations或scoreDerivedLabels=false时型名、候选、排名、原型中心、组合文案全部抑制。educationalContent=false时不展示个体行动建议，即使参考模板写了也不放宽。方法/一般限制可以显示，质量细节受resultQualityDetails控制。

状态顺序：来源身份/数值无效=>INVALID；学科/年级/作答者不符=>NOT_APPLICABLE；缺核心/limited=>INSUFFICIENT；全轴已高低但组合未覆盖=>UNCLASSIFIED；绝对匹配<75=>UNCLASSIFIED；首二差<8=>MIXED；首候选未满足硬规则=>BOUNDARY；否则MATCHED。数值0不当missing，量尺不允许的0为INVALID。

不把理论画像写为潜在类别、概率、诊断或常模；固定局限披露ASE精确数学版PILOT、V/C边界与时点不同。无合法辅助就不推断兴趣、焦虑、自主、SRL或浮力。

## 7. 四入口真实能力矩阵与P6顺序

| 入口 | 当前main真实能力 | 本轮顺序/完成标准 |
|---|---|---|
| Training/通用Bundle | 原生Bundle V3定义→精确组件→FINAL→analysis→报告→历史/重试 | 第一完整切片：EVC安装/试验发布→12题→单项及综合→幂等重放/恢复后重开 |
| Survey | governed BUNDLE保存TEXT/METRIC/FORM_FIELD拼装报告；非本Profile模型 | 后续独立薄适配共享内核与冻结结果，避免render异常回滚FINAL；只在真实消费者完成后标支持 |
| School | 普通/原生组件执行与反馈；P6候选仅wholepackage preview/read | 第二切片消费整体包，不能拆分/改跨工具算法；需要DOT协调跨入口release接口 |
| Teacher | 同上，另有观察者/学生边界 | SELF核心不冒充observer；完整旅程及权限证明后才标支持 |

不以教育enum、普通COMBINATION或preview通过代替真正Bundle执行。每个入口报告已开发/提交/推送/合main/云端装载/生产上线分开。当前三个后续入口仍NOT_IMPLEMENTED，不把它们写成验收成功。

## 8. 验收归属与证据

首次自然提交仅本设计；自审后实施。切片1包含新引擎/包/投影/UI及必要测试，完整可审阅再开Draft PR。切片2是独立四入口P6薄适配，不把多个复杂包任意混编纳入范围。

| 检查 | 发现的故障 | 主要位置/最小范围 |
|---|---|---|
| package1/2合同、旧hash、loader roundtrip | 新字段被丢弃、旧包漂移、错误引擎混用、未知字段 | GitHub正式；开发只定向定位 |
| 典型六型+缺失/null/0/越界/方向/边界/未覆盖/近邻/远离 | 硬分型、反向两次、绝对拒判顺序错误 | 新纯内核定向case；独立手算S04 |
| 核心/辅助质量、确定性/输入顺序 | 辅助无效冒充核心有效、随机/顺序依赖 | 新纯内核，同输入一次 |
| 受众投影与撤权 | 标签/候选/行动/图在API泄漏 | 服务端真实policy及投影case；浏览器只验证UI消费 |
| 新旧定义冻结/历史读取 | 模板升级改变旧报告、catalog被在线读取 | provider+持久化定向case |
| 真实隔离PG FINAL与幂等重放、重开 | 重复计分/重复artifact、失败回滚FINAL | 仅此云端隔离test DB或正式CI指定唯一主执行位 |
| dump/restore后报告读取 | 数据/定义/报告不自包含、恢复重算 | 必要代表合成图；不触碰生产DB |
| 真实浏览器12题→单项+综合→恢复/重开 | UI断链、图标记/移动溢出、导出越权 | 代表学生旅程，教师受限响应；同一产物 |
| 类型/编译/SAST及选中gate | 实际消费者类型/加载失败、安全回归 | 真实路由选择；不伪造门禁 |

旧42 PASS/12例只作为参考预期，重新核当前输入后才作本系统测试；不重复全工具评分、四套公式或无关全站矩阵。需要正式CI前重新读Notion checklist并选适用ID；完整base/head/tree/raw diff、消费者闭包和预算写入验收记录。保留首错/run/job/attempt/SHA，两次失败不收敛先停止定位；换SHA不清零。不APPROVE、不强推main、不改保护/密钥/权限，不自动部署。

预计范围：设计/核查30—60分钟；核心切片2—4小时；定向正式资格约10—30分钟（以实际CI路由/排队为准）；后续P6按真实缺口另拆，不塞入首切片。5分钟检查等待点，不追加无关任务。

## 9. 性能与恢复方案

开发前记录代表baseline：FINAL到报告可读延时、GET延时、SQL条数、CPU、RSS/heap、响应字节、加密facts/定义字节；同环境/Node/硬件/合成fixture改后复测受影响点。纯Profile O(K*m)，本例18项差值；静态包按不可变hash有界缓存，禁止跨用户权限缓存。读取已存报告不调用engine/scorer、不扫全体被试、不查最新模板。重放FINAL返回原submission/artifact；崩溃后的PENDING沿既有重试，不宣称分布式exactly-once执行。

不新增PDF/图片双归档、每人复制题本、在线LLM/LPA或外部实时探测。科学原件维持已有私有存储，不触碰生产COS。新增迁移仅在确有缺口时提出，不为6×3计算新建统计数据库或队列。

## 10. 自审结果与待决

已修正的设计问题：
1. 不能直接把B synthetic:true入口用于真实学生，原参考仅作算法来源；原生适配器必须由已验证冻结FINAL构造事实，不伪造synthetic/integrity标志。
2. 不能把旧42PASS称平台验收；源码归档没有dist/log，记录实得文件与字节。
3. 不沿用P6三点diff作可合入范围；逐目标直接比较，未知授权核心不碰。
4. educationalContent=false是实际限制；建议模板存在不代表可发给学生。完整教师/研究者视图不是权限。
5. 不升级整个SnapshotV3；完整包已被冻结，兼容扩展内层即可。
6. 不为辅助槽位写optional绕过当前产品约束；首示范只有两项必需核心。

待决仅为专家主模型/适用范围冻结及后续P6共享接口协调；不阻塞独立内核、包解析与首切片开发。尚无测试/性能/正式CI/合并/云端装载/生产部署成功主张。

## 11. 首个实现检查点（待接口协调，不是闭环交付）

设计提交：35c31f5522277d5d7d09c6be1764208029c58a6d。后续本地实现目前完成：
- package2严格联合分支、profile.json正常loader/write/generate；旧package1内容hash公式不变。
- 同族引擎精确注册1.1.0；独立候选B的原参数、六型、硬规则/L1、绝对拒判/近邻/边界。
- 精确数学来源C哈希：ASE `ea8cd4535b0c80c64bf6c93e538f2d33b282860136bcb153ac053b06d9f9da2d`；VC `931040631cfcb3c02b7d7116374537b1a2aff5805cbf0e22258e18b43d158ff3`。来源Git blob也与研究原文吻合。
- 原量尺/派生标签/教育行动/方法的独立受众投影；真实教师源策略下WITHHELD，API投影无P4及候选、原型中心或行动。
- 发布/再准入复用现有签名review，Profile额外核对原有cross_source_condition claim；没有新审批系统。
- 16项有界静态配置缓存，只存冻结包，不存个人结果/权限。

接口方案进一步缩小：**无需修改CanonicalUnitResult、ScaleResult、BundleFrozenScaleSource公共类型**。新增 `profile/sources.ts` 使用已有canonical core及bridge构造本子能力局部交叉类型；旧sources projector与旧分析hash均保持原字节。在真实analysis中仅package2调用此适配器即可。

仍待DOT协调的最小改动：
1. `bundle-product/service.ts`：Profile声明的年级Context字段同时生成现有canonical gradeLevel表单；同一答案供原单项eligibility和Profile使用，不扩权限。不必新增通用Context字段或修改授权核心。
2. `bundle-product/analysis.ts`：package2读取新局部source适配器，保存Profile payload；使用既有逐slot admission policy附加ProfileView。辅助无效不能把合格核心强制降为整体无效；不改package1语义。
3. `BundleReport.tsx`及必要局部组件：消费服务端白名单、中文原量尺图与状态；不在浏览器重算Profile或权限。

这些接口尚未修改；ProfileView目前只是经过测试的服务端函数，尚未暴露真实GET。未完成UI、真实FINAL、恢复、四入口P6、正式CI或可合并资格。新包仍DRAFT，不能把本检查点作为已可运行产品发布。

### 实际验证与失败历史

主执行环境 Node24.21.0，已激活云端官方安装环境；不使用Mac或生产DB。
- 首个原生包check失败：参考包三指标unit=mean_item_response，当前依赖验证要求points。仅修正原生传输unit标签，原分/均分/量尺/转换未变。
- package2定向CLI check成功，四种contract fixture与静态精确依赖成功，内容hash `441d7cdafc4e3851e711eaabe26dbbbab29f96564fa4e59b6bdeed0311b1c8ff`。
- 43项定向Vitest通过（新Profile23 + 原合同18 + 原loader2），后续缓存/严格四fixture补验2项通过；不是旧参考42项，也不是全系统验收。保留JSON/TAP前的原stdout与exit。
- 首次后端noEmit类型检查失败：fixtures expectedProfile两处unknown、admin-authoring fixture string索引一处，共3诊断。修复联合fixture形状并保持严格四种fixture；没有改admin-authoring生产文件。
- 缩小到上述两个消费者的TS API复验，因缺Express全局augmentation出现13诊断；原日志保留。补入真实auth/requestId/pagination声明及原config的.d.ts后，1558源闭包、0诊断。原编译选项和全部诊断保留，无过滤、无生产tsconfig改动。
- 隔离baseline原旅程先因旧test库缺account_domain/survey_tool_policies失败；仅对本云端test库部署现有main迁移成功。后续分别因缺ASE reference集合及DEPLOYMENT_BINDING_MISSING失败；**未到FINAL，不存在成功耗时/SQL/CPU baseline**。停止重复旅程，静态定位需正常installScaleInstrument + plan/publishStandardScale安装两项工具（含原参照、deployment/轴快照/入口policy）以及canonical gradeLevel上下文。未放宽标准量表准入。
- baseline使用的临时fixture与所有失败日志已保留在仓库外 `/workspace/bundle-inputs/`；未将临时诊断fixture加入正式suite或当作平台PASS。

后续只补实际缺失旅程；已通过纯算法输入未变时不重复全套。类型补验与正式CI复用能力须由真实route决定，不能把本地未签名结果冒称官方CI。当前没有启动正式CI或PR，连续正式CI失败次数为0。
