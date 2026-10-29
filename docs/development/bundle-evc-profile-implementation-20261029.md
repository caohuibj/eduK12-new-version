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
