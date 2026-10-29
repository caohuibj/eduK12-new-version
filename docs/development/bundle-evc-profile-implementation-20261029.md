# EVC 理论 Bundle：实施与验收设计（2026-10-29）

状态：首个切片已实现，隔离 PostgreSQL/真实会话 HTTP/恢复读取通过；正式 CI、浏览器页面、合并和生产部署尚未完成。第11—12节保留早期检查点，最新结果以第13节为准。执行仅在独立云端，禁止访问生产数据库。分支 `feat/bundle-evc-profile-20261029`。

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

采用依据：委托要求优先复用B参考实现；有精确可校验源码、六型、拒判规则、固定中文文案及12例。作为独立研究候选集成，不替代A、不平均阈值、不改年龄或科学身份。DOT后续明确选择B为首个研究试验示范，继续工程验证；无需修改B的理论、阈值或年龄。代码合入不等于科学批准、DB发布或生产上线。

B参数保持原值：三轴等权；低<=.35，高>=.65；低/高中心.2/.8；模糊节点.25/.5/.75；加权平均绝对距离 d，匹配=100*(1-d)，绝对拒判优先于分差；全精度计算，显示才舍入。六型为 HHL、HHH、LHL、LHH、HLL、LLH；LLL/HLH明确未覆盖。

## 3. 核对过的数据映射与三轴版本

| 构念 | 精确单项/指标 | 原分与方向 | 转换/要求 |
|---|---|---|---|
| math.academic_self_efficacy | academic_self_efficacy_mathematics_zh_cn@1.0.0 / academic_self_efficacy | 5题，1—5，越高越有把握；保留下学期题干 | (raw-1)/4；核心要求完整且可解释 |
| math.importance_utility_value | value_cost_mathematics_zh_cn@1.0.0 / value | 3题，1—6，重要性/用途，不能写兴趣 | (raw-1)/5；完整且可解释 |
| math.time_opportunity_cost | 同VC / cost | 4题，1—6，越高时间/取舍负担越高 | (raw-1)/5；不反向，不称情绪成本 |

源blob须与实际文件核验；Git blob只作来源，不作运行 measurementHash。生产映射固定实际 measurement 内容hash、scoringVersion、语言版本及来源版本。E/VC原 scorer 的 calculated 语义要求该分量表完整，缺答为limited/not_calculable；优先复用这一契约，避免为本功能改变共享单项计分/CanonicalUnitResult schema。若核心完整性不能由现有协议证明，输出INSUFFICIENT，不伪造expected/answered。

版本分别固定：Bundle定义C=0.1.1、映射=0.1.1（原生完整定义hash修复，见第13节）；模型/参数P=0.1.0（算法 weighted-l1-guarded-v1）；中文模板R=0.1.0；引擎 declarative-evidence-v1@1.1.0；onboarding package schema=2；外层 FrozenBundleProductionDefinition schema2、Bundle Snapshot V3均保留。单项 C/P/R 不变（instrument/scoring/localization1.0.0，既有report1.1.0）。

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


## 12. DOT协调回执与Draft推进

DOT已确认：B原参考是首个研究试验示范，保持原L1参数和7—12年级范围，不宣称最终科学定版。允许Bundle限定gradeLevel采集、analysis受众投影和报告UI；不同独立分支可分别推送，不修改任务1授权核心、管理员UI或其分支。

已实际推送设计35c31f552及候选e860cfc4202d049e4b16a19ddca03eaffa1234b0，远端分支回读吻合；main回读仍2de32609。Draft前静态核到新包缺少既有content-check要求的ci-fixture，补齐同一12题S04合成输入，不改量表评分或既有断言。

Draft激活范围：base2de32609、scope实际分类platform/legacy；Draft只运行既有light compile/type及独立publication观察，不授予Ready/合并资格。适用CI-003（真实类型闭包）、CI-006（正常安装/部署前置）、CI-007（新增包/ci-fixture清单）、CI-019/020（范围、原始结果和未执行状态）；真实PG/browser尚未通过，不启动Ready全平台作为排错。已有45个纯算法/合同本地结果不重复运行，未将其冒称正式CI。后续Ready资格需冻结实际完整功能切片及适用范围。


## 13. 原生闭环与第二自然提交（2026-10-29）

### 结果与版本边界

已推送的历史检查点为 `35c31f5522277d5d7d09c6be1764208029c58a6d`、`e860cfc4202d049e4b16a19ddca03eaffa1234b0`、`4f329cdb57b19201ad930559acefedc71c47d2fb`。本节对应后续原生闭环提交；提交SHA以Git为准，不在同一提交内制造自引用。

B仍是独立研究试验候选 `learning_motivation_math_support@0.1.0`，7—12年级、三轴等权、六型与全部L1参数不变。真实PG揭示 `canonical.core.sourceDefinitionHash` 是包含报告设计的**完整运行时定义**hash，原参考记录的measurement C hash只覆盖科学测量定义，两者不可互换。因此Bundle/映射升为0.1.1，模型/中文模板仍0.1.0，引擎1.1.0；未声称B科学定版。

- 原生包contentHash：`34625844b7014e409a423e99ee2f31fdf28f3d41f629d6432a928e9a2214a941`。
- 完整ASE runtime hash：`8b4eb7b667ede55476fdb5f1c8be3d42627b9677f6a9dcd5379f23f7cfe83a73`。
- 完整VC runtime hash：`53e935260ed7c4e54e7dbfdc67a8b1f68c4fcc64ec4aa4ebacc6371e90c1c89d`。
- 第11节两项C hash继续独立验证；同时验证精确计分版本、语言、均分来源题数和实际原量尺。
- 分支早期0.1.0仅存在本云端合成DB与尚未合main的候选历史；目录移为0.1.1，原UNAVAILABLE分析未覆盖。schema2读取允许缺runtime hash以保持旧冻结artifact原hash；新发布必须有且匹配实际runtime hash。package1解析/hash未改变。

### 实际改动及共享文件清单

新增 `profile/admission.ts` 只为声明的Bundle年级字段生成canonical `gradeLevel`选项；年级不产生个人数据权限。`profile/sources.ts` 是局部交叉类型，只读取已经解析验证的canonical envelope。完整性按选中的generic item-mean分量表calculated状态判断，其他辅助分数的缺失不会冒充核心无效，核心自身缺失仍拒判。

共享消费者的精确改动为：

| 文件（相对server-version） | 最小输入/输出 |
|---|---|
| `backend/src/modules/bundle-product/service.ts` | package2年级声明→既有Context formItem；其余包不变 |
| `backend/src/modules/bundle-product/analysis.ts` | package2 canonical source→原持久化facts的Profile payload；原鉴权/冻结admission policy交集→可选ProfileView |
| `backend/src/modules/assessment-bundle/report-facts.ts` | 仅新增兼容可选 `profileView?: ProfileView`；旧字段保留 |
| `backend/src/modules/bundle-product/admin-authoring.ts` | 原preview附加可选模型及合成状态；profile包独立review明确要求既有cross_source_condition claim |
| `frontend/src/pages/bundle/BundleReport.tsx` | 消费服务端白名单，可选ProfileView走新增局部组件；既有报告路径保留 |
| `frontend/src/pages/bundle/BundleAuthoring.tsx` | Bundle专用内容预览展示冻结参数与研究试验状态，不涉及管理员精确授权分配UI |

未修改CanonicalUnitResult、ScaleResult、共享授权/grant核心或任务1分支。`analysis.ts`还沿用单项冻结report audience约束，防止仅有numeric权限的其他受众取得画像解释。WITHHELD不返回型名、候选、排名、原型中心或行动。实际source策略下教师被抑制，学生可解释；所有来源educationalContent=false，所以真实示范的actions为空，模板中的建议没有越权显示。

前端新增中文画像摘要、三个各自原量尺的SVG与等价文字表、拒判/混合状态和方法版本；无雷达面积、综合动机分或概率。报告重开从已有BundleAnalysis读取，不重新运行单项计分、画像或查最新模板。静态包缓存上限16，不缓存用户/权限。

### 验证、首错与未执行项

只使用本云端隔离 `eduk12_test` 及独立恢复库，无生产DB。原有main迁移已按正规流程部署到test库，没有新增schema迁移。两项量表均通过正常installScaleInstrument→plan/publishStandardScale补齐reference、deployment与入口policy；Bundle通过正常安装和独立签名合成review发布，未直接写审批状态或取消断言。合成review不是生产科学审核，也不是GitHub APPROVE。

| 证据 | 实际结果/边界 |
|---|---|
| 原45个算法/合同/loader/cache检查 | 原43+2 PASS保留，不重复运行；不冒称参考包旧42项 |
| 新选中核心质量案例 | Vitest JSON及stdout为1 PASS/23 filtered；原组合工具调用exit存在不一致，未把整次调用提升为合格exit0证据 |
| 新setup预览 | 1 PASS，exit0；原签名review claim、B模型/映射身份、四fixture状态、canonical grade选项 |
| 前端 | 新ProfileSummary 1+原BundleReport 2 PASS；集成frontend types exit0；后续BundleAuthoring闭包232源文件/0诊断、exit0 |
| 后端类型 | 集成检查0诊断；最终实际消费者闭包再次0诊断/exit0；未过滤诊断、未修改tsconfig放宽规则 |
| 首次PG lifecycle失败1 | STALE_ATTEMPT：fixture错用child context hash；改读parent canonical context。保留原日志 |
| 首次PG lifecycle失败2 | durable FINAL/replay成功，期望READY实际UNAVAILABLE；静态解密确认三项IDENTITY_MISMATCH，定位C/runtime hash区别后停止重复旅程 |
| 显式修复读取 | 新0.1.1正规安装/发布后，仅重分析已存FINAL，READY P4、匹配96.666667；原UNAVAILABLE及factsHash保留；不重跑单项计分 |
| 真实会话HTTP新首次FINAL | 登录→启动→canonical年级FINAL→5+7题FINAL→COMPLETED→INITIAL READY P4；两项单项报告/三项原分2.2、5、5及个体解释保留；重复FINAL replayed=true；再次GET factsHash一致 |
| 首次结果DB核对 | attempt `bfacf613-754a-47a0-90c4-6b2b267757f8`，一条INITIAL READY、三个单元snapshot；没有第二次综合分析。factsHash `6c01a7af4bf4f0f84369ae0b5d8fa9a935330a90225133465bfddef6ed3ead53` |
| 备份恢复 | pg_dump -Fc 1863944字节，SHA256 `addc0b7c66aefbc0c73135907b431228c5a03b15ceb2dfc652d9f5355ef984c8`；独立新库pg_restore exit0；恢复读取1 PASS/exit0，校验factsHash且spy禁止画像重算、历史两条分析和三单元保持 |
| 浏览器 | Chromium sandbox=true启动前失败，helper实际owner不合要求；未使用--no-sandbox、TLS忽略或修改helper权限。尚无真实DOM、截图或键盘/布局成功证据 |
| 正式CI/合并/生产 | 均未执行；正式CI失败累计0。Draft PR创建审批服务故障且已知未执行（下文），未绕过或换工具重试 |

新原生HTTP和恢复是补缺失消费者，并非重跑此前45个纯算法检查。完整新lifecycle测试文件保留可重现入口，本轮不把其两次失败改写成整套PASS；成功的全新0.1.1首次FINAL由上表真实HTTP证明。原日志/JSON及私有合成fixture均保留在本云端 `/workspace/bundle-inputs/`，包含密码/signingKey的fixture为0600且不入Git。后续正式CI须按实际支持能力判断本地未签名证据的接纳，不能冒称已经通过官方门禁。

性能记录是单样本、无负载：修复后的保存报告服务读取20.91ms、SQL5、CPU user22.417/system4.383ms、响应4095B、facts密文12198B/定义密文39980B；新真实HTTP两项FINAL总446.27ms、整体报告GET98.94ms/18278B。两组计时范围不同；早期baseline前置失败，因此没有有效修改前同环境baseline，也不主张性能提升/p95/生产容量。恢复原件无新增每题计算或PDF/图片双归档。

### 正常安装与后续入口

从backend工作目录使用现有 `npm run bundle:package:preview -- src/modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1`，然后 `bundle:package:install -- <目录> <管理员ID>`。两项精确工具须先按原normal install/publication正常可用；在既有Bundle内容管理页由不同审核者检查scientific/rights/language/report及cross_source_condition，再发布完整包。创建Bundle实例绑定ASE和VC精确版本及同一课程，发布后受试者填写年级并完成两项；不把内容文件requestedStatus:DRAFT误当DB已发布。配置签名密钥走现有环境配置，不入内容文件。

第7节矩阵仍有效：本次闭环是Training/通用Bundle。Survey现有 `FrozenGovernedPackage`/`governed-package.reports.ts` 是单独的已冻结TEXT/METRIC/FORM_FIELD拼装契约，不能直接把B型算法伪装为普通BUNDLE枚举；School/Teacher的P6候选仍只有wholepackage preview/read。后续最薄桥接需要接收**完整原生包hash＋精确slot canonical结果＋现有release/admission身份**，输出可选持久化Profile payload/白名单，原GRANT和单项权限继续由任务1所有。没有合入P6 WIP、拆分完整包或声称三入口已接通。

### 外部阻塞（已知未执行，不绕过）

创建 `caohuibj/eduK12-new-version` 的Draft PR（head本分支、base main、draft=true）返回原文：

> Automatic approval review failed: Selected model is at capacity. Please try a different model.

工具明确说明：action was not executed；这是审批服务未完成，不是安全判定。按平台要求停止该操作，未改用gh/其他工具绕过审批，未执行GitHub APPROVE。需要DOT/平台恢复审批服务后提供与该故障有关的新证据，才可重试。分支提交/正常push继续，不受此创建PR动作故障影响。

Ready前仍须独立审阅精确base/head及适用CI：当前实际scope是platform/legacy，Draft选light，Ready默认会选全平台；不能通过skip/伪造成功规避。新功能正式缺失项为受影响build/正式CI与真实浏览器，后续四入口为独立功能切片。用户要求最少重复，故不把全平台Ready作为首轮排错，也不将未经正式接纳的本地结果冒称必需门禁成功。

本自然提交前再次回读main，发现已推进到 `6142ddc74db9787f6606746610df58c73de256f5`（PR387三项独立量表材料，11路径；不含EVC两源、Bundle、授权或本消费者）。将按正常merge对齐，避免强推和改写已推送历史；上述旧base结果仅对未变化的对应输入有效。


第二自然提交已推送：功能 `97d053106`，正常对齐main后的远端head `05a7f697c4045a87e1ee1d11b6540d29a0e61948`；回读main `6142ddc74db9787f6606746610df58c73de256f5`。工作区提交前自审已完成。跨整个main差异的whitespace检查发现新增文件EOF空行（工作区增量检查未覆盖早期提交），仅删除空行；不改变可执行token，也不据此重复应用检查。正式Draft/CI与真实浏览器仍受上述明确阻塞约束。


## 14. DOT applicability P1定向修复（2026-10-29）

已实读Notion09的 `BND-R-P1-APPLICABILITY-20261029`，确认根因：package2的runRules在显式适用条件false/unknown时返回UNAVAILABLE，Profile wrapper却继续计算。修复为直接返回同一UNAVAILABLE合同，先于runBundleProfile与modifier求值；没有改B参数、单项计分、package1或当前未声明此条件的EVC内容。新增false、unknown两小例严格比较整个结果，禁止携带profile/modifier/解释payload；真实Vitest结果2 PASS、24未选中，exit0，日志 `profile-applicability.{json,log,exit}`。原43+2及PG/HTTP未重复执行。

本轮继续授权已明确允许在原模型下有界重试Draft一次。此前创建已知未执行，本轮先以GitHub只读API按head查询所有状态PR，结果为空；仍保持同仓库、head、base main及draft=true。官方云端README所指浏览器脚本实际使用--no-sandbox，与本次安全要求冲突，因此不执行该脚本；平台capabilities为空，无另一已注册浏览器入口。当前helper owner=nobody/mode4755，只读核实后保留环境阻碍；不改owner/mode或降低沙箱。


## 15. Draft PR388与首次正式CI（2026-10-29）

按DOT本轮有界重试授权，先两次只读确认本head所有状态PR均为空，再使用原connector、同模型、同head/base、draft=true重试一次，实际创建 [PR388](https://github.com/caohuibj/eduK12-new-version/pull/388)。原容量故障仍保留，不改写成首次创建成功。PR source head `0d3548b16fc00d6407d9bb368513d95da81de149`、base `6142ddc74db9787f6606746610df58c73de256f5`。

创建前重新实读现有Notion CI清单并运行真实classifier。首次正式 [run40909139388 / attempt1](https://github.com/caohuibj/eduK12-new-version/actions/runs/40909139388) 已完成：classify、backend compile、mini-program smoke、maintenance均SUCCESS；独立publication run40909138329 SUCCESS。frontend job123572262243的npm ci及lint SUCCESS，typecheck FAILURE；merge gate连带FAILURE。没有正式browser/UI/Ready资格。累计正式失败1次，不以新SHA清零。

CI-003根因已经定向复现：轻量Draft job只安装frontend依赖，但main既有 `PrivateFormRuntimeRendering.test.tsx` 静态导入后端form definition/runtime/adapter，闭包需要backend Zod、Prisma客户端。GitHub failure annotations实际报告这两模块缺失和连带implicit-any；TypeScript host只隐藏本机backend node_modules（未改文件/tsconfig）即复现同类原文件诊断。main与本head的这些测试/依赖闭包/两锁文件/tsconfig/CI job字节相同；本机已有backend依赖令早期类型结果通过，不能等同干净frontend-only安装。首次预检未识别轻量job与正式frontend组件前置不一致，记录这项遗漏。

最小修复已经具体化：Draft `pr-light-frontend` 复用现有 `ci-frontend.yml` 的同一正规前置 `npm ci --ignore-scripts` + `npx prisma generate`。不改业务、断言、锁文件、tsconfig、门禁阈值或模块缺失错误。候选patch在本云端 `pr-light-frontend-dependencies.patch`，尚未应用CI文件/激活下一轮。现有legacy Draft路由不支持仅以一次请求接纳本轮已成功job并复验缺失frontend，故不声称已能自动复用；不为本功能临时建立第二套CI admission框架。

GitHub原job metadata/annotations已取得；job日志下载重定向到签名存储返回Forbidden，未声称取得完整原stdout，未改变域名绕过。读取main保护必需checks API另返回Resource not accessible by integration (HTTP403)，已停止该读取；不改保护规则。实际PR merge gate仍以GitHub当前状态为准。

### CI失败回写阻塞及可复制条目

已按AGENTS尝试向原Notion清单末尾追加CI-003复现（不改维护人/历史/共享权限），工具返回 `Automatic approval review failed: Selected model is at capacity. Please try a different model.`，并明确action was not executed。此Notion写入为NOT_WRITTEN，未绕过或重试，不因Draft创建曾成功便虚构本次写成功。下面保留原失败所需复制内容，DOT/平台恢复写入后才能继续相关CI激活。

- CI-003：PR388，source0d3548b16、base6142ddc74；run40909139388/attempt1，frontend job123572262243。
- npm ci、lint成功，typecheck缺backend Zod/Prisma及连带implicit-any失败；main既有跨包测试导入闭包与frontend-only安装前置不符；本地后端依赖掩盖了干净安装差别。
- 修复候选：仅复制已有正规backend锁定安装/Prisma generate前置到Draft frontend job；原失败和backend/maintenance/publication等真实成功保留。
- 下轮checking：CI-003核干净依赖/生成schema，CI-019保留首错及未跑browser，CI-020冻结精确head和实际证据接纳能力。不能自动把原成功job重跑、把没有官方接纳的本地结果标成门禁成功。
- 正式失败累计1；下一轮未激活。浏览器真实页面、正式Ready资格及合并仍未完成。

### 跨入口实际共享接口（请求DOT一次边界协调）

独立静态追踪进一步确认：P6四个package-reference文件未进入main；其整包U依赖任务1所有的 `public-source.catalog`，不能从叶工具或Training授权自行推断整包U。School/Teacher当前 `assessment-resource.service.ts` 克隆为ORGANIZATION_RESOURCE并不保存BundleInstance；main的聚合finalizer/readCompletedCompositeBundleInputs只识别ASSESSMENT_BUNDLE，个人报告reader也只展示单项receipt。因此不能用family=BUNDLE或普通组合伪称native EVC已执行。

最小拟用接口与文件（未改授权核心/共享底层前先按原委托交DOT协调）：

| 文件 | 最小兼容输入/输出 |
|---|---|
| `education-tools/package-reference.{contracts,headers,catalog,source}.ts` | 从已读P6候选仅复用整包精确sourceRef与现有U检查；不合并其WIP或制造叶grant |
| `education-tools/assessment-resource.{contract,source,service}.ts` | 可选nativeBundle `{definitionHash,bindingsHash}` 及完整原包；按原slot顺序一体实例化，保留原组织资源身份/权限与三轴选择复核 |
| `assessment-runtime/unified-aggregate-finalizer.service.ts` | 只在ORG资源确有完整冻结BundleInstance且身份匹配时使用原Bundle编译hash/INITIAL持久化；普通ORG资源不变 |
| `bundle-product/analysis.ts` | 相同canonical读取和已存Profile结果；不重新评分、不借Training身份授权 |
| `reporting/education-assessment-personal-report.service.ts` | 现有execution/SELF/subject/respondent/来源权限复核后增加兼容可选综合投影，仍在输出前重查权限 |
| `survey/publication.service.ts` 的FrozenGovernedPackage与专用adapter | 可选完整native包引用，不拆包；使用实际Survey frozen unit result及精确source hash，FINAL后持久化分析状态，报告失败不回滚FINAL |

当前B的适用对象是7—12年级数学学生SELF；Teacher自身SELF入口不能把教师冒充学生。通用Teacher Bundle机制和本B科学适用性应分别验收。先沿现有SELF lane，观察者能力不自行扩张。以上不是已开发/通过主张；已异步提出一次具体接口边界问题，同时继续无此依赖的定向修复与CI诊断。

官方云端README浏览器路径实际脚本含--no-sandbox，故没有执行。平台没有另一注册browser capability。已异步提出具体新增权限动作：只在本云端以require_escalated启动/usr/bin/chromium、保持chromiumSandbox:true/TLS/文件权限，验证宿主原helper；批准尚待，不以时间经过代替批准。未修改owner/mode或禁用沙箱。


补充：尝试仅更新PR388正文以交接上述真实CI失败状态（不推新提交、不触发CI），也被自动审批容量故障拒绝执行。此正文更新已知NOT_EXECUTED，PR当前正文仍是创建时文本；未换工具重试。当前远端功能head保持0d3548b16，本节失败交接记录仅在本云端，未推送以免重新激活未解决的Draft路由。运行时代码无未提交改动，CI前置patch尚未应用。


## 16. DOT继续授权与CI前置修复

DOT已在原Notion CI清单增量写回PR388首轮CI-003并回读成功，source0d3548b16；本节点不重复写同一条。按本轮明确授权，已应用第15节五行前置到Draft frontend job，与main的正式frontend组件相同：原锁定backend install（ignore-scripts）＋prisma generate，没有启动后端、迁移或seed。现有控制用例 `frontend compilation and checks are separate while both remain required` 定向1 PASS、exit0。没有以any、跳过缺模块或弱化断言修复。下一次正常Draft同步仍按实际legacy路由执行，未新增临时证据接纳框架，也不把原成功job改写为本轮结果。

精确的单次浏览器安全启动已通过执行环境require_escalated正式审批并执行，/usr/bin/chromium、chromiumSandbox:true、TLS与owner/mode保持原值，about:blank成功、exit0。这只证明宿主原有沙箱能正常启动，不等于EVC页面验收；后续代表页面旅程将按同一正式执行权限机制单独提交。原受限环境失败保留。

共享边界已获DOT协调：允许可选nativeBundle在组织聚合、个人报告和Survey冻结包中消费；整包身份/来源适配放专用Bundle adapter，默认旧行为不变，不修改角色或精确grant核心。继续在独立分支小提交推进；真实整包U仍须存在，不因接口未接通绕过。


## 17. CI收敛、真实浏览器及School整包闭环

第16节修复已提交并推送 `ce5d062b6708154c9ff94eb074e8303be960968b`。第二轮正式 [run40912998176](https://github.com/caohuibj/eduK12-new-version/actions/runs/40912998176) SUCCESS：实际选中的classify、backend compile、frontend lint/typecheck、mini-program smoke、maintenance、merge gate均成功；独立publication40912997055也成功。第一轮run40909139388的失败保留，累计一次后已收敛。这里是Draft light成功，不外推Ready完整资格。

真实浏览器已通过两次独立正式require_escalated审批：先验证官方Chromium沙箱启动，再执行本地合成账号的cookie登录和已存报告。首次页面脚本错误等待training-login，本地127入口实际使用auth/login，尚未进行报告断言；保留首错并仅修正等待URL。最终实际完成P4中文概述、三轴原量尺SVG及表格、两份单项报告、无获准教育行动、键盘展开、重开同factsHash和390px无文档横向溢出；无页面异常。证据 `evc-browser-result.json`、desktop/mobile截图，source ce5d062b6，sandbox=true。TLS、helper owner/mode和文件安全设置未修改；这不是生产或School浏览器验收。

### 本切片的生产接口与权限边界

School沿**既有完整sourceComposite的material.distribute授权**接通，不冒充尚未进入main的P6公开包U目录。prepare已经核原整源和全部C/P/R授权，adapter随后保留完整Bundle定义密文，只重映射原slot/context的全部itemId，冻结definitionHash/sourceBindingsHash/bindingsHash。缺槽、混入额外槽、来源变化均拒绝。已有R、SELF、execution、开放时间、受试/答者和当前权限检查全部保留，单项不可读或核心metric未开放时综合画像WITHHELD。没有从年级推导身份/权限。

共享改动清单：

| 文件 | 实际最小变化 |
|---|---|
| `bundle-product/education-{identity,adapter}.ts` | 可选三hash身份、整包保留、人口适用检查、受限综合反馈投影；不颁发grant |
| `bundle-product/instance.ts`、`service.ts` | 原readInstance及Bindings原样抽到纯模块，service兼容re-export，避免组织服务循环初始化 |
| `education-tools/assessment-resource.{contract,source,service,repository}.ts` | 可选nativeBundle身份、完整绑定保存/读取校验；普通旧来源无新字段/新hash |
| `education-tools/assessment-resource.routes.ts` | 识别专用身份错误；Teacher青少年模型400，绑定冲突409；不改角色判断 |
| `bundle-product/runtime.ts`、`composite/composite.service.ts` | 只给确有BundleInstance的组织资源执行原包admission、编译身份和INITIAL处理 |
| `assessment-runtime/unified-aggregate-finalizer.service.ts` | 原聚合完整性/FINAL路径识别上述native组织资源，持久化INITIAL；不另计单项分数 |
| `bundle-product/analysis.ts` | readReport可选同事务DB参数，旧调用默认不变，避免嵌套全局连接池读取 |
| `reporting/education-assessment-personal-report.service.ts` | 原权限后可选nativeBundle，仍输出前recheck；仅已开放核心单项进入综合反馈 |
| `frontend/.../EducationAssessmentReport.tsx` | READY时增加只读中文BundleProfileSummary，沿用既有图表与方法说明 |

保持B模型0.1.0、包/映射0.1.1、template0.1.0与原L1参数，仍标研究试验，未变年龄范围。Teacher成人SELF拒绝此youth模型，不把教师伪装学生。此adapter只输出package2 Profile反馈；其他旧包仍按原单项报告且综合WITHHELD，不宣称所有复杂包都已接通。

### 新增定向证据与首错保留

新增adapter4例PASS（完整映射/无改定义、拆混拒绝、单项/metric受限弃权、Teacher人口拒绝），UI1例PASS（READY展示、WITHHELD移除综合反馈）。自审错误状态改动后仅重跑该4例，exit0；未重跑原43+2。最终backend生产与新fixture类型闭包2311文件0诊断、exit0；frontend对应337文件0诊断。最初adapter的service动态加载形成TDZ/超时，已用纯instance抽取修复；首次便携夹具缺加密key已改成受控测试stub并恢复。保留原失败，未放宽断言。

真实PG按正常签名发布原Bundle、独立C/R发布/组织资源register-review-publish、Campus身份/班级/名册/报名审批、正式run授权发布与START、年级FORM FINAL、两SCALE FINAL、原个人报告reader完成。新资源8c349460-8079-4954-a5e6-bf004a2e81b7，attempt1a7542f0-f6e9-4707-a87e-0e6a40d41a4a，P4 READY、actions=[]，factsHash `584f20b0a2df6e165331bbb2b6e0f3d5d990e213db05f045497737fa93c14122`。模型config hash仍87f889c9…40a3f。实际服务continuation PASS，不把此前setup失败或因缺opt-in跳过的执行算通过。

前置首错依次是PERSONA_REQUIRED、CAMPUS_KEY_NOT_CONFIGURED、重复合成unit名、合成login超长、ROSTER_FROZEN、缺expectedVersion/expectedRunId；均在计分前，使用现有正常persona/capability/登记窗口/run版本接口修正，未直填审批状态或撤销断言。中途一次从仓库根启动Vitest exit127无测试，亦非通过。反复夹具补齐造成无效调用，已改为先完整静态类型/合同核对，再从已发布资源checkpoint继续，不重复C/P/R发布。新fixture文件明确区分完整安装、已发布资源续行和只读/重放验收。

`education-native-saved-read`实际验证原受试者重开同factsHash、另一管理者拒绝、同submission FINAL幂等、1 INITIAL/3 snapshots；scoreScale和projectBundleReportFacts spy遇调用直接失败。随后自审修复同事务读参数，仅复验受影响读取/重放，PASS。未找到旧非native组织资源样本，legacyIdentityRead=false，不能声称这项真实旧组织历史验收通过。

School新状态原生pg_dump2230414字节，SHA256 `461fb131e7a95eab20308170ff9c7865b345995171516fe6a44da162505b5dfd`，恢复独立 `eduk12_evc_school_restore_20261029_test`，pg_restore无错误。仅在恢复库以connection_limit=1运行保存结果读取/重放：PASS、另一actor拒绝、零新计分/画像调用、相同hash。单样本read793.28ms、CPU user362193/system39080μs、SQL event51、响应2334字节；不是p95或网络往返数。原测试库未覆盖，未访问生产。没有合格改前同条件baseline，不声称性能提高。

### 当前入口矩阵和未执行项

| 入口 | 此时实际能力与缺口 |
|---|---|
| Training/通用Bundle | 正规安装、发布、年级/两组件FINAL、单项+综合、HTTP重放、真实Chrome/移动宽度、持久化恢复已验；Draft正式CI已绿，Ready完整资格待办 |
| School现有明确授权整源分发 | 本切片真实PG发布→Campus START/FINAL→单项及P4综合→异actor拒绝→单连接恢复读取/幂等已验；新UI定向合同已验，School实际浏览器NOTRUN |
| Survey | 仍只有现有TEXT/METRIC/FORM_FIELD的组合报告合同，未有native Profile冻结/持久化/完整发布消费者，NOT_IMPLEMENTED；不能用BUNDLE枚举替代 |
| Teacher | 青少年EVC B不适用于成人SELF，明确拒绝；本次未扩展科学年龄，也未声称另一个成人包已完整验收 |
| P6公开整包U | 原候选仅preview/read；main公共U key尚不含NATIVE_RELEASE。未改通用授权核心、未merge任务1 WIP、不以叶工具许可替代整包U，NOT_IMPLEMENTED |

PR388正文先前两次容量故障均已知未执行；此切片提交后按DOT最新授权先读回再仅有界重试一次。当前Ready路由仍是platform/legacy，真实required将涉及广泛默认套件；没有现成给本分支接纳这些本地应用证据的通用途径。不能通过skip、伪造gate或抢跑merge解决，不能把Draft green冒称Ready green。需在自然节点集中协调适用正式qualification范围，不为此创建新CI平台。

最新已读main c52e1675fe7990ce49b42589d993fb12e8541ae1（PR389独立32份材料），没有改EVC两源或本切片消费者。提交后按正常merge对齐并回读，不改写已推历史。新输入将再执行实际受影响Draft正式检查；适用CI-001/003/006/019/020，原第一轮失败保留。未执行生产部署、GitHub APPROVE、保护修改或生产数据访问。


## 18. Survey native整包完整切片

按DOT继续授权，本次没有等待缺失接口，而在现有Survey治理生命周期内增加可选native引用：系统内容作者用本人已发布原生Bundle的compositeId/definitionHash/bindingsHash和明确Context映射提交；只接受原包全部且同序的SCALE/FORM组件，原始完整计分定义必须一致。原包定义/模型/报告文字不从客户端接收，不允许替换跨工具报告，也不允许嵌套或把叶许可当整包U。支持范围明确是schema2 Profile的SCALE＋声明的数字Context；其他原生族拒绝，不冒称适配完成。

新增 `bundle-product/survey-source.ts` 只处理内容来源/冻结与当前新增准入，`survey-native.ts` 只包装已有单项计分事实、复用既有Bundle projector和Profile受众交集。没有新增授权表、队列、版本生命周期、SnapshotV4或新报表系统。现有governed artifact独立review/三案例试运行/Survey整包grant/import/不可拆用/连续投放校验均保留。批准不自动授予研究者U；technical child grants仍不能发现、复制或单独使用。完整模型仅共享保存在governed artifact与publication，个人FINAL只增加小型已存受众投影和factsHash，不复制大题本。

### 共享接口与正常安装路径

| 文件 | 增量合同 |
|---|---|
| `survey/governed-tool.{model,service,routes,summary}.ts` | package提交可选nativeBundle来源；本人原包精确header只读预览；单工具R可选audience（省略仍researcher）；原模型/映射/模板版本在完整原包冻结；列表报告轴识别native R |
| `survey/governed-tool.content.ts` | R发布保持显式student/researcher受众，旧缺省仍researcher |
| `survey/governed-tool.trial.ts` | 新native内容在原有三条合成试运行里消费已经算出的单项，验证综合投影，没有再运行单项scorer |
| `survey/governed-package.service.ts`、`publication.service.ts` | FrozenGovernedPackage可选完整native定义与每槽R受众/原policy，保留原parentGrant；新增准入查原精确source和签名package；历史读不查新来源；静态最坏报告预算继续沿原4MB合计上限 |
| `survey/final.compute.ts`、`final.service.ts` | 原一次单项计分之后、FINAL hash/加密之前增加nativeBundleReports（状态/hash/两种受众已投影结果）；轻量计算失败保存FAILED，不使已验证作答因可选画像错误丢失；无在线自动重算/新增retry生命周期 |
| `survey/participant-feedback{,-response}.ts` | 原个人凭据/同意/撤回/开放时间边界后，核心单项R与全部选定metric均实际开放才附加综合反馈；未知source policy或不同R受众不公开单项/画像 |
| `survey/governed-package.reports.ts` | 原append-only报告表保存researcher投影；不把student view放入研究者artifact，保留旧schema/budget/读取授权 |
| `frontend/.../GovernedToolsWorkspace.tsx` | 原来源编制选择R受众；组合包可读取本人已发布原包身份、完整组件对齐、绑定必填数字Context；不提供模型参数改写 |
| `frontend/.../SurveyPublicApp.tsx`、`StoredPackageReports.tsx` | 原单项反馈保留，附加中文只读Profile；first FINAL可读新receipt，恢复仍独立鉴权；研究者显示实际WITHHELD，不在前端重建学生解释 |

实际安装顺序：已有原生Bundle正规安装/科学签名发布→两项原精确工具经Survey系统内容作者提交C及student R、独立批准与试运行→研究者编制必填数字年级FORM并正常共享批准→组合包选择这三个精确已批准组件，读取本人原包版本并明确grade_level→grade映射（报告不能另写）→独立批准并试运行→Survey入口管理者显式授予研究者该精确整包U→研究者整包导入、原工具选择器完整选中、波次显式开放两单项所需metric反馈并发布→匿名SELF有同意及本次私密凭据→正常FINAL→两单项与综合反馈→独立凭据重开。界面与POST /api/platform/survey-tools/submissions/package使用同一合同，没有管理者身份自动读取个体结果。

B模型仍0.1.0、映射/包0.1.1、模板0.1.0、model hash87f889c9…40a3f。不是成人Teacher EVC；没有重生量表材料、改变阈值、增加常模或在线拟合。Survey样本Context只作为适用性输入，不能授予个人数据权限。研究者与学生的R受众均冻结，原source政策与R受众求交；本B研究者不得得到Profile，只显示WITHHELD。R受众不匹配时连numeric/method字段也不借综合包开放。

### 实际验证与首错

新增纯适配3例（手记S04冻结分数，不调用scorer）最终PASS：P4/确定性与受众交集；缺Context为UNAVAILABLE、坏分数为FAILED而非硬分型；单项R/metric未公开则综合弃权。后续只给新增UNKNOWN策略边界补同一受限用例，未重跑原43+2。首轮误用measurement-only hash作为完整runtimeDefinitionHash，被新适配用例拒绝；修为原完整canonicalHash，与冻结模型8b4eb7…/53e935…一致，不改模型参数。缺失必填Context不能送进要求完整Context hash的facts builder，改为先保存UNAVAILABLE/CONTEXT_MISSING。R不同受众原先仅清解释、未清数字投影，测试实际指出后改为交集全拒绝；首错保留，未减弱断言。一次仓库根Vitest命令未选中测试，另一次根目录node无法解析tsx，均不算测试PASS。

真实隔离PG按正常入口完成：系统管理者changeEntryGrant→研究者invite/redeem/MFA真实TOTP enrollment→已有原EVC签名review正常续期→两原单项C/student R独立review和试运行→数字Context FORM共享review→完整native整包review/试运行→manager whole grant→import→prepare/open→匿名有同意START→FINAL。首错分别是FORM纯数字optionKey不符合合同、NUMBER答案误用字符串、原逐题施测缺itemTimings。均保留；前三次未产生FINAL。随后先对全部FORM与逐题metadata用现有无计分validator预检，再从checkpoint续验，已成功的C/R/整包批准与试运行不重复。没有直填approved/ONLINE/ACTIVE审批状态，研究者ACTIVE来自正常MFA服务；组织管理入口grant来自原正式命令。DRAFT项目/用户作为隔离基础fixture创建，不宣称完整管理端浏览器注册验收。

最终真实PG调用exit0：project fe9bd9e5-c79d-4bee-844f-b8a85e9190cf，attempt613f7fb2-2e7a-43c7-a8b7-252c403f737b，FINAL91fdbb12-d492-4151-9e0d-f096f3f65c3a；学生P4 READY＋2单项，researcher Profile WITHHELD（无构念数字/候选），manager读取私有报告拒绝，FINAL重放idempotent=true、仅1行FINAL，scorer/profile spy均未调用。factsHash `5987659111ad2207f543f254b7dee191dc4e9246f97e79f733396489f742aae9`。另一个只读/来源边界case实际验证拆包、重排、来源hash变化拒绝，无计分。独立保存读取测试初次缺Survey显式opt-in，被正常拒绝；只补两个环境标志后定向读取PASS，未重跑已过来源边界。

保存读取另有错误私密凭据拒绝，spy确认没有scorer、Profile projector或current native admission/source查询。源库单样本104.55ms、2290字节；原生dump2304229字节，SHA256 `1726278269044511aae269a06e39572c2970f2d05b0aabb05d7d007344c06eef`，恢复新库eduk12_evc_survey_restore_20261029_test。恢复库connection_limit=1同样保存读取PASS：96.63ms、CPU user74031/system16154μs、2290字节、同factsHash。不同执行环境不能当性能改善或p95；没有改前可运行的native Survey baseline。没有生产数据或生产部署。

新增前端消费者2例PASS/60未选中：学生first FINAL综合＋原单项并存、重开重新鉴权；研究者只渲染服务器WITHHELD且无导出。作者UI另1例实际PASS：读取本人原包、必需Context未绑定时禁止提交、精确全部slot＋原包引用提交，report=null。对应frontend types exit0，backend含生产/新fixture2421源闭包0诊断。完整研究者管理浏览器NOTRUN；不以transport mock当浏览器通过。Survey代表恢复页面将仅补缺失的实际浏览器，不重新作答计分。

轻量native计算属于现有Survey FINAL的确定性工作；失败状态保存在同一不可变结果，GET不会重试。尚未增加旧FINAL的显式新版本画像重分析UI/任务；不得把FAILED说成READY或读时重算。现有单项C/P/R解释与研究数据权限保持独立。

## 19. 最小正式qualification计划（待集中review，未改路由）

本PR完整差异含Bundle engine/schema2、聚合FINAL、Survey冻结/报告及前端消费者，不能伪装成纯量表内容、普通组合、文档或A/B外观变更。无DDL、依赖/锁文件/生产配置变化，但结果合同与持久化消费者改变；保守按运行时C范围审核。最新已对齐main e65d87222；最终head/tree及完整raw diff在此功能提交后回读，不能借用d58的正式成功。

当前可执行的既有Draft legacy route会真跑backend compile、frontend lint/types（包括锁定backend依赖/Prisma前置）、maintenance、mini-program、stable gate与独立publication，适合普通预检，不能替代Ready资格。d58的run40926329352全绿保留原身份；Survey新提交尚未跑正式检查。现有onboarding-structure只有固定历史PR及local admission；survey-assessment、shared-authoring、school-teacher均有精确历史base/product/branch绑定，不能直接改branch参数声称可用。本次不markReady，不运行平台全工具、无关浏览器、媒体或性能套件。

建议扩展**既有school-teacher qualification family**的一个有界native-bundle场景，不创建每PR一套workflow或通用证据/签名平台。具体拟改文件与最小职责：

1. `.github/scripts/school-teacher-scope.mjs` 与现有bindings数据：新增本候选native-bundle场景，绑定完整base/head/source/merge tree、每个raw路径/模式/blob及backend/frontend/config/locks/schema；保留历史observer/SELF分支判定。未知路径、外部PR、强制full/manual、不匹配产物拒绝，不回退全平台。
2. `.github/scripts/school-teacher-checks.mjs`：沿原命令/原件验证器增加本场景recipe。可以复用现有onboarding-checks的原report逐case/失败续验验证函数，但本地结果只有DOT独立审阅并明确接纳后才消费，不冒充Actions原执行。按实际共享调用闭包判断旧43+2、P1两例、School/Training PG/浏览器及Survey3＋新增权限/来源/前端case；原失败/filtered/未知退出都保留。不得仅按函数未变认定可复用。
3. `.github/workflows/ci-school-teacher.yml`：复用现有frontend/backend producer、postgres/restore、browser与runtime security/qualified消费者，以场景精确选择缺失输入。当前轻量编译没有可验证的正式可发布dist artifact，故需两组件各正式构建一次并保留manifest/hash，后续原生装配/浏览器/扫描消费同一产物；保留锁定依赖审计、运行时HIGH/CRITICAL及受影响SAST。已接纳的本地同输入PG/恢复/真实浏览器不重做；未接纳的项明确为缺口，不能静默标绿或用HTTP替代。是否可接纳由DOT独立review决定，不由本实现自行签发。
4. `.github/workflows/ci.yml` 如原workflow输入/runner预算需要兼容字段，仅透传可选场景；`.github/scripts/merge-gate.mjs` 只在所选新qualified字段确有需要时增加严格校验，仍要求scope、school-teacher、codeql真实success，不减少原必需项。对应既有scope/gate/checker控制测试补外部PR/未知path/错tree/缺result拒绝，不新建独立门禁。

最小必需证据清单：精确边界与实际来源；已验证模型边界＋新适配/受众合同；真实FINAL/幂等、错误actor/凭据拒绝、恢复后不重算；中文跨入口报告；当前两组件正式构建/锁定审计与runtime scan；变化生产及控制代码CodeQL；stable selected gate。无schema变化，不以此新增迁移矩阵；本轮已有真实当前schema dump/restore证据，若被接纳不重复。单项计分公式未变，不重跑全量工具或四套同公式。

预算：原始证据/边界接纳1—2分钟；两组件构建并行各2—4分钟；安全扫描/审计依赖官方下载，通常各2—4分钟；CodeQL一次3—6分钟。缺失且获准的精确浏览器另2—5分钟。5分钟作为具体等待项通报阈值，不能因下载超时弱化TLS、扩大等待或换SHA清零。正式失败目标累计一次后收敛；本次无新正式失败，不抹掉首次CI-003。

此节为明确可审计划，不是已实现route或已获正式资格；需要DOT在自然节点就这组有限文件/接纳边界集中判断后实施。新生产/测试源码可先正常提交推送Draft；禁止跳过CodeQL、伪造gate、抢跑merge或更换保护。生产部署仍未授权。


### Survey自然提交与收尾证据（第18—19节增量）

完整Survey切片已提交/推送并回读 `347abae8b0c593b8bae6985b17bf1ec0dd00a328`，tree `401d0875c8f59f249a2365fdb44bdd4ce4707978`，main仍e65d87222。新正式 [run40934585880](https://github.com/caohuibj/eduK12-new-version/actions/runs/40934585880) 全部实际selected Draft checks SUCCESS，publication40934585793 SUCCESS；不是Ready/CodeQL/运行时扫描资格。原正式CI-003失败保留，未新增正式失败。

代表Survey真实浏览器在正式require_escalated审批下已PASS。使用原正常openWave邀请与START发放的合成匿名私密凭据恢复到实际页面，真实general API显示P4、三轴图表、两份单项反馈，行动按原权限为空；刷新再次独立读取同factsHash59876591…42aae9，390px无文档溢出，无pageerror/外部站点访问。保存截图已实际查看，source公共报告消费者是347abae8b，未重做作答/计分。首轮误用未设置VITE_DEV_PRODUCT的localhost，未进入Survey应用、未读报告；保留首错，改为仓库已有survey.localhost开发入口后PASS。未mock task/report/score/权限，不以HTTP代替浏览器，不关闭sandbox或TLS校验，不修改owner/mode。此为受试者恢复/阅读旅程，不冒充研究者注册/编制全浏览器验收。

最后自审发现新native header读取期间输入仍可编辑、异步响应可能与用户后续来源编辑错位。只给来源输入、Context选择与取消按钮增加原busy锁，保持已发请求的身份与显示一致，不改授权/参数/报告输出。只复验受影响的原生编制UI1例，实际PASS；没有重跑已过PG、原43+2或三入口整浏览器。后续这份一行UI保护与文档形成独立小提交；347的正式成功保留自身source，后续head按实际Draft同步结果单列。

新增UNKNOWN权限用例已通过；曾误要求隐藏其他独立获准构念数字的断言已明确纠正为该核心数字与完整Profile/方法不可读，其他本来获准的单项数字可以保留。研究者整体R不匹配仍无任何构念数字。原失败历史不清零、不冒称为生产漏洞。

当前实际能力矩阵更新：Training、School现有授权整源分发、Survey现有整包U三条EVC试验链已具备真实FINAL/单项＋综合、受众边界、保存/恢复和代表阅读浏览器证据。Teacher成人SELF仍明确不适用本B，未修改年龄范围；一般人口匹配的包仍消费现有合同，但本轮没有另造一个成人科学模型或宣称已跑通成人示范。P6公共native包目录U仍是另一来源入口未接通，不能以此否定已经独立验证的现有整源分发/Survey整包U，也不能冒称P6已完成。

CI checklist已有本次提交/fixture首错/原CI修复成功和下一轮边界增量写回；Notion09自然节点交接随后以最终远端head和当前真实结果为准。第19节qualification路由改动仍只是待集中review计划，没有新增workflow/改gate/移除CodeQL，尚未合main或部署。


### 冻结与旧版本兼容收尾

编制页锁定修复9ca165b1b已推送，正式run40936037550和publication40936032164均SUCCESS，后台tree与347完全相同。随后只读自审补了两个必要合同：Context的FORM只能包含已声明且唯一映射的全部字段，不能在原包槽位里夹带额外问卷；只在R原件**显式记录**audience时才向governedSnapshot增加此可选metadata，旧R缺省不补默认属性，避免改变旧组件/technical grant/整包的既有hash。旧R实际发布audience缺省仍researcher；这不是扩张旧授权。

新增表单字段拒绝并入原来源边界case，真实PG定向1 PASS（只读，无作答/计分）；旧SCALE/R metadata投影与手写历史形状严格相等、canonicalHash相等、显式student R保留的新增case1 PASS。没有找到旧非native整包的真实历史样本，不能把这个纯投影合同声称为全套旧Survey PG升级验收。本B原显式student R及三字段映射输入均未改变，不重复其FINAL/恢复/浏览器。以上为独立小型兼容提交，后续CI只报告其实际source结果。


### Survey单项R的另一读取消费者

在合成已完成FINAL上新增真实只读probe确认：原 `survey/report-results.service.ts` 的研究者接口会返回 `{accessAudience:researcher,intendedAudience:student,reportBlocks:1}`。probe使用本B仅RAW指标的student R，不宣称真实用户或敏感解释已泄漏；这一新接线不能只保护综合artifact而忽略单项入口。

最小修复新增一个共享消费文件 `survey/report-results.service.ts`：沿原项目/研究者/数据/来源权限之后，读取**该FINAL冻结publication中对应unit**的可选nativeBundleReport受众，原生R未开放researcher时返回403。实现放 `bundle-product/survey-source.ts`，仅查当前FINAL的一份静态publication（最多30unit），不扫被试、不调用当前native source/admission或重新计分。历史/非native unit无此字段时返回undefined，原通用报告路径保持；没有把所有报告的intendedAudience重新定义为一套通用授权策略，也没有重写角色、grant或管理员分配。

只复验受影响保存读取case：学生2单项＋P4仍可读，研究者不能经旧单项接口绕过native R受众，原aggregate研究者WITHHELD/错误凭据拒绝保持，scorer、Profile与current native admission spy零调用，实际1 PASS/exit0。原PG FINAL/三入口浏览器不重跑。该共享文件及最小输入/输出已列明供DOT在本自然节点集中复核。

## 20. Native Bundle资格控制草稿（DOT已限定范围，尚未激活Ready）

本自然切片只改既有School/Teacher控制族，不改72078d2的业务源码、B科学模型、年龄、量表、DDL、依赖或锁文件。固定base仍为e65d87222d351e5dfde52e389f3aa403380443eb，产品锚点72078d2ccd1546abe4ca915366b694a18433c44a，产品tree d285d33c5c8e1ad0a4ffc1c7fe3c22a0625e9c4d。backend tree为0e2ef32d7467de7b7da6f1700918c510a7ca7554，frontend tree为5a2676e3fea15901e55cd320c4b015678a49528a。最终控制HEAD/tree在自然提交后独立记录，不能为避免自引用将JSON里的一个状态字当作外部授权。

### 精确差异与既有消费者

- 新增`school-teacher-native-bindings.json`及同目录`school-teacher-native.mjs`，场景名native-bundle，与旧School/SELF/observer绑定分离。85个产品路径和12个控制路径逐一绑定旧/新blob及正常模式；27个关键控制/锁/schema/配置/运行时输入另显式核对。其余传递输入由固定base和完整raw diff限定，未知新增/删除/混合/模式变化不能进入本路线。自引用binding本身不伪造固定blob，其完整内容和最终source/tree仍需DOT审阅。
- 现有`school-teacher-scope.mjs`只加场景选择、完整PR source/checkout tree一致性及正常main双亲合并观察；保留旧分支、SELF_BASE、历史官方run的独立行为。新分支不能借旧marker、手动full/probe或外部PR进入其他路线。旧官方run不作为本候选产物。
- 现有`school-teacher-checks.mjs`为native增加最薄phase分派。两个producer各构建一次，沿用ci-artifact manifest，分别输出同run/attempt的runtime context；没有重复运行已有43+2、PG或浏览器。审计仍使用原锁定production依赖HIGH/CRITICAL验证器。
- 新`school-teacher-native-runtime.py`直接复用既有exact-candidate-runtime.py的安全解包和runtime_recipe纯函数。只接收本run/attempt、当前head/component tree/lock/内容hash一致的编译闭包；保留原生产Dockerfile运行时段，不能npm ci或再编译业务。官方固定Node/Nginx版本拉取后记录digest，实际镜像ID喂给Trivy0.70.0，保持原os/library、HIGH/CRITICAL及ignore-unfixed策略；保留完整扫描结果、DB metadata和命令退出/hash。backend还验证canvas/sharp及worker入口。未执行镜像构建、下载、审计或扫描，不宣称已有runtime资格。
- 复用`ci-school-teacher.yml`的admission/frontend/backend-self/security/qualified，在同一workflow中只新增native-evidence和native-runtime消费者，没有新workflow。既有SELF graph测试仅补两个未选中native节点应为skipped的图结构预期。
- `ci.yml`仅加新场景必要的产品锚点fetch、现有轻量分类名单、原manual/probe拒绝名单与原School caller。真实CodeQL job保留，native选JS/TS加新增Python运行时控制、security-extended；Python路径使用目录根并排除无关旧Python，原始SARIF保留供独立处置，不把analyze成功当作发现已处置。原30分钟CodeQL上限不变。
- `merge-gate.mjs`继续独立重算完整candidate。Ready仍必须scope、school-teacher和真实codeql全部成功，缺失/失败/取消/skipped不能通过；未改保护、身份、密钥或生产配置。

### Draft控制预检与Ready的区别

只推控制变更时，旧legacy Draft会重复编译未变业务源码，因此在同一family增加明确`preflightOnly`计划。实际Draft只有完整source/tree/raw边界及实际输入核对和严格汇总；本地已完成的合成控制unit不在CI重跑；不安装业务依赖、不编译、不运行应用/PG/browser/审计/镜像或CodeQL。stable Draft gate要求scope与该控制workflow实际成功；该计划不能用于Ready，门禁会独立拒绝伪造或漂移。它既不接纳720的应用结果，也不授予合并资格。

当前binding保持`enabled:false`、control review PENDING。即使将控制状态字改成已审，`native-evidence`仍无条件拒绝未被独立接纳的应用断言；此处有意没有新增通用attestation、签名或自批准层。DOT读原件后，再以明确小补丁接入原验证器或仅运行真正缺失的断言，不能仅改一个label标绿。当前不能markReady或启动重型资格。

### 控制验证与保留的失败

native集成控制9例实际PASS，Python编译上下文/沿用runtime recipe控制2例PASS；受影响SELF范围/拒绝/图结构/producer控制4例PASS。actionlint1.7.12从官方release取得，官方checksum核验后检查两个workflow，最终exit0；这里只检查YAML/Actions表达式和action合同，未安装shellcheck/pyflakes，不冒称运行了这两项。

新增控制首轮6PASS/1FAIL是测试误断言不存在的accept_media缺省字段；用显式acceptance配置验证所有选中输出关闭，失败原件保留。actionlint首轮检出新增job级runner.temp上下文不合法，移至step env；同文件8处历史端口数字索引改为等价字符串键，保持实际端点不变，最终两文件exit0。不是通过忽略这些错误取得成功。

定向旧School suite得到31PASS/5FAIL；5个失败在未修改72078d2的隔离源码副本逐个复现（原样5FAIL），来自旧fixture的虚拟base与fresh模式冲突、旧SAST字符串预期。未修改旧绑定去追认或清零历史，也不把这5个旧合同列为本native新选中断言。旧完整SELF frozen-controls断言本来绑定历史候选，不能因本控制变化而被描述成当前候选已合格。

### 原件接纳、缺口和唯一执行地点

当前应用证据全部保持未签名本地原身份，控制预检不会下载或签发这些结果。已存在的原始report/exit/log及测试名、修复/filtered/失败均保留。此前Survey索引在执行后生成，并未完整记录每次历史调用当时的argv、全环境字节清单和输入闭包；不能把当前source哈希补写成当时执行证明。DOT需要据原件和实际传递消费者逐项审阅，不能只凭ZIP摘要或本节结论接纳。没有据此擅自重跑已过的PG、恢复或浏览器。

| 尚未完成的资格项 | 唯一执行地点/处理 |
| --- | --- |
| 模型/权限、Training/School/Survey FINAL、幂等、恢复、浏览器等原本地断言的正式接纳 | DOT先读保留原件与输入闭包；native-evidence目前明确阻塞。只有具体缺失断言被定位后才指定一个定向执行地点，不将整个历史矩阵重跑。 |
| 当前两组件可验证正式编译产物 | GitHub原frontend/backend-self两个producer各一次；Draft旧编译无可核验dist artifact，不能当作已合格产物。 |
| 当前锁定production依赖审计 | GitHub原security job，两组件；不替换HIGH/CRITICAL策略。 |
| 运行时包装/扫描 | GitHub native-runtime，消费上述同run/attempt产物；不再编译。跨attempt无自动fallback，失败须先定位及独立检查可复用的成功producer。 |
| 受影响JS/TS与Python CodeQL及原SARIF处置 | GitHub原codeql job实际执行；处置由独立review完成，未通过前不能合并。 |
| 正式qualified与stable gate | 上述实际结果齐备后的原workflow/原stable gate；当前Draft成功只表示控制预检。 |

预算修正：控制边界/原件核验约1—2分钟；两个producer各预计2—4分钟并行，runtime包装/扫描受官方下载影响应保留原30分钟作业上限并报告实际等待项。CodeQL需保守按接近20分钟或更久准备，原job上限30分钟；此前第19节3—6分钟不是保证。五分钟是报告具体等待项的阈值，不是超时后削弱检查的理由。本切片不启动Ready重型任务，不改成人EVC适用性，不部署。
