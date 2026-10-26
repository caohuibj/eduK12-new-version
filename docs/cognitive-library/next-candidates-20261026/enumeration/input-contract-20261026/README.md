# 点数判断：真实输入合同提案（仅文档，等待根 dot 独审）

基线：cognitive-next-three-core-20261026 @ 162db124919801532c2b08e9b55d911f8e1e8652，tree 106af824852fa788a65514f89f35af27eac985bd。本轮只读源码、整理合同及计算静态配方 hash；没有改产品源码、seed、delivery、registry、数据库、凭据、CI 或部署。这里的版本与新字段均是明确提案，尚未成为真实 schema。MOT 保持上一审查结论，既有浏览器/宿主原件不补签、不复跑。

## 1. 本案选择与已批准边界

推荐将当前已实现且与获批稿一致的白点/中灰、名义5°路线冻结为一份具体内容配方；不选择旧预览里的7°代码路线或深点白底对照。两 profile 共用配方、输入和单次时序，只保留100/25正式的既定差别（研究4块，体验1块），独立3练习。旧 design.json 的 PENDING 等为历史状态，不覆写；批准依据为 Notion 母页第9节及原图。

批准图源提交9969583b2c95fa87ff44a4f2b3aa68cbd7471390，路径 docs/cognitive-library/next-candidates-20261026/enumeration/review.png，SHA256 65b63eeaa6045ce0554a5e6c197e6752480aba7bd36b7db3f83bc6f4624fe538。本轮没有生成或更换示意图。截图确认布局，不认证物理亮度、设备时序或人群效度。

|保持的输入/刺激事实|明确含义|
|---|---|
|中灰 #808080、白点 #FFFFFF|名义sRGB，非50%物理亮度证明或论文精确RGB|
|5°方形显示底、圆域采样，点直径0.5°|保留现实现；没有新加圆形裁切；圆域采样是本项目具体变式，不冒称完全复制上游7°方域|
|注视1000ms，正式名义50ms，练习1000ms，遮罩1000ms|现有capture政策不变；偶发一帧/十几毫秒按用户已接受原则，不加计时白名单、阈值或误差分析|
|48×48原创二值遮罩，现有两色、seed及LCG|保留当前固定mask；不是获权上游noise.png或光学验证|
|整数滑杆1–15，种子化随机初值，显式确认|触控/指针/键盘兼容；不改成5–9按钮；回答不限时，操作RT不当知觉速度|
|现有canvas、注视十字和CSS布局|drawEnumerationFrame的十字arm=min(12,fieldCssPx/12)、lineWidth=2及DPR变换不改；不引入入口品牌色/新字体|

## 2. 一份可亲读且有实值的配方

提议 recipeId：enumeration-square5deg-circle-white-grey-mask48-r1。

- definition：recipe-definition.proposed.json，逐字段沿用当前 EnumerationRecipe 的真实参数结构，换去 synthetic 的示例ID/source。
- hashScheme：仓库已有 CANONICAL_JSON_SHA256_V1。
- recipeHash：1aee9b741bbdd8d8ca64cded52bed2bcc294f78be1415ebe1fcd5b4a3130acf1。
- recipe.canonical.json 是512个UTF-8字节的实际摘要前像（没有尾换行），不含自己的 hash。完整绑定说明在 recipe-binding.proposed.json；pretty JSON文件的字节SHA与内容canonical hash分开记录。
- source拟用host_reviewed_candidate，status仍为CANDIDATE_RECIPE_NOT_VALIDATED。这是根dot审核通过后才可采用的目标值，当前文件外层明确PROPOSED；不把设计获批改称科学验证通过。
- 当前 enumerationStimulus 将 recipe.id 纳入种子。换真实ID会改变同一旧示例seed的具体点位，不能称逐点重放兼容；保留当前点位算法、圆域/不重叠规则、拒绝采样预算和随机流政策。旧示例保留原ID、seed、点位及hash，不重标为本配方。实际生成点位仍作为已有原件保存，不为报告在服务器重生成。

未来真实配置使用现有 stimulusRecipe 槽，从null改为严格对象：
    { schemaVersion: 1, id: recipeId, hashScheme: CANONICAL_JSON_SHA256_V1,
      hash: recipeHash, definition: 上述完整配方 }
必须id=definition.id、hash=canonicalHash(definition)，且严格匹配允许的配方。配置保存完整definition，不依赖“去目录找最新版”。两profile各自冻结解析configHash；配方本身相同不等于两版configHash相同。

配方进入 assignment/source 发布、compiled runtime和SessionConfigSnapshot.config（现有字段）；configHash由既有机制计算，protocolSignature由协议定义计算。不能把recipeHash、configHash、compiledRuntimeHash互相当作同一种摘要。当前只是这份输入对象的提案，尚未创建或发布上述任一配置实例。

## 3. 校准如何与真实session冻结

校准因设备和本次观看位置变化，不能塞成全站/课程的固定数值，也不能把fixture里的348px/500mm改名当真实测量。复用现有 EnumerationCalibration 全部字段：

|现有字段|来源与冻结要求|
|---|---|
|source|真实入口只接受self_reported_ruler_and_distance；synthetic_fixture仅内部审阅，不转为正式来源|
|referenceMm / referenceCssPx|实体尺所对应参考线真实长度/本次CSS长度。若setup采用现有5cm线，则referenceMm实际为50；不从DPR或屏宽猜毫米|
|viewingDistanceMm|用户实际测量并确认的距离，保留自报性质，不称传感器实测|
|viewportWidthCssPx / viewportHeightCssPx|既有window.innerWidth/innerHeight，在本次确认时取值|
|devicePixelRatio / visualViewportScale|既有浏览器值，在同次确认保存|
|id|建议按不含id的上述校准内容canonicalHash派生enumeration-calibration-r1:<hash>；内容不变不靠改ID制造新校准|

保留现有finite/positive、视口/DPR/scale变化、实际可放下与canvas内存预算检查；不引入MOT的其它数值距离限制，不做强制六秒预检、刷新率/clock probe、亮度或指纹采样。实际输入来源继续用现有provenance和逐响应input，不新增一份设备真值。

现有换算完整保留：
    cssPerMm = referenceCssPx / referenceMm
    span(deg) = 2 * viewingDistanceMm * tan(deg * PI / 360) * cssPerMm
    fieldCssPx = span(5); dotCssPx = span(0.5)
    canvasWidth/Height = ceil(fieldCssPx * devicePixelRatio)
现有margin/可用空间规则不改变，不以自动缩小来满足屏幕。它是声明校准下的名义视角，非物理曝光/观看位置持续性认证。

明确分两次冻结：
1. 发布/START：服务器冻结配方、profile、config/协议/版本、seed及真实session/epoch；此时服务器尚未知道被试校准。
2. 校准确认后、首个练习reserve之前：在本设备耐久事务内冻结B，之后本attempt不得换recipe/calibration/language/realm/seed继续曝光。最终FINAL提交轻量B时，服务器才首次接收并绑定这些自报校准值。不要称START前已获服务器确认；本案不增加施测前备案API。

B建议包含：schemaVersion=1；真实sessionId、attemptEpoch、configHash、protocolSignature、engine/scorer/configVersion、randomSeed；现有language(zh/en)、recipeId/recipeHash；完整Calibration及calibrationHash；已有EnumerationPageOrigin(timeOrigin/pageInstanceId/source)。只记录现有字段，不增加时钟探测。语言由host明确提供并冻结，不猜UA；没有真实语言入口就仍标未接通。

bindingHash=canonicalHash(B)，不含自身及artifactHash。实际contextId由bindingHash派生；原attemptId槽可用sessionId+epoch的规范摘要派生有界标签，原始真实二元身份仍在B中。端口的唯一作用域必须是真实sessionId+epoch，改contextId/标签不能清除曝光或realm归属。

本机承载建议使用已有FinalDraftMeta.instrumentMetadata的任务命名空间。现有setInstrumentMetadata仅浅合并，尚不满足原子首次冻结：后续需在同META事务内核对既有FinalDraftWriteIdentity及“未冻/已冻同hash”，不同hash拒绝且保留旧原件；不能get→await set来假装原子冻结。不新增IDB版本/store、DB表或队列，不把MemoryStore称为耐久。具体任务端口留待合同审过后接线。

## 4. 无循环的原件与core绑定、服务端核验落点

建议native专属Artifact/Record使用schemaVersion=2和CANONICAL_JSON_SHA256_V1；现有内部v1继续使用自己的candidate-json-stringify-sha256-v1，旧hash不重算。只是为新格式采用仓库已有canonical编码，不改点位随机算法。

顺序必须为：
    R -> recipeHash
    calibration内容(不含id) -> calibrationHash -> calibration.id
    B(不含artifactHash) -> bindingHash/contextId
    A = v2 Artifact(context含B、现有maskBits、已有pageOrigin；不含artifactHash)
    A -> artifactHash
    F = {schemaVersion:1, binding:B, bindingHash, artifactHash}

A中不得反向放F或自身artifactHash。recordHash在完整v2 Record外计算；同record重试保持原hash，不在paint中做序列化。完整A和生成点位/frames/练习原件放本机耐久草稿，后续完整COS包仅保留一份A。没有新采样/录像。

轻量F仅放在**第0条正式core的presentationContext**中，后续正式core必须无此副本，只携带presentationBindingHash及原有calibrationReference/renderedStimulusReference：
- presentationBindingHash=bindingHash；
- calibrationReference=Calibration.id；
- renderedStimulusReference=artifactHash。
练习完整记录也引用同A/B，但不塞入正式计分分母。新字段名称是待审的任务payload提案，不是已存在的全局schema或“三要素总版本”。

DB的既有CognitiveRawSubmission.payloadEncrypted因此只多一份轻量F及每trial引用；不存maskBits、点位表或逐帧日志。其余完整原件按既有core先保存/报告先可看、COS后归档、同身份重试及严格确认后清通用草稿处理。不从COS回读、重算或修正报告。 这份轻量校准仅用于本次输入绑定/一致性，不在服务器增加设备常模或科研计算。

实际查证：AuthoritativeScorerInput只有config/sessionSnapshot/trials/randomSeed，**没有真实sessionId/epoch**；现有枚举scorer只检查非null引用，不能凭这个接口声称服务端已验证完整归属。推荐最小落点：
- 新任务级纯helper（建议enumeration/native/presentation-binding.ts）校验F/B摘要、严格recipe/calibration来源和全部正式记录引用；
- 在unified-final-submit.service.ts现有prepareAuthoritativeScorerContext之前，仅对新枚举精确tuple调用helper，传入已授权child.id/attemptNo、prepared.snapshot.configHash/protocolSignature及child.randomSeed；
- 不增加全局FINAL顶层字段、不改V1 provenance，不伪造父级contextSnapshotHash承载校准。既有外层session/epoch/submission/幂等授权规则继续负责真实业务身份。
- helper只做轻量声明一致性/归属检查，不做科研回放、曝光误差判定或刺激再生成；正常计分仍一次。它不认证用户是否真的按尺测量。

现有EnumerationPersistence.complete只有单一confirmed回执，finalize还要求完整正式序列；它尚未实现MOT的core/归档分态或中断收尾。本输入提案不假称已解决，后续native端口接线必须明确这些状态，不能因旧complete通过就声称COS已确认，也不能捏造缺答来补齐次数。

刷新/中断沿现有候选合同：旧realm结束该次曝光序列，保留原记录和未决marker，不拼接performance时钟、不重曝。若全部正式已耐久记录，仅提交/归档原B/A/记录，不挂runner或生成新realm artifact；部分正式不得以新校准继续同attempt。尚无正式记录时不捏造trial/分数来完成FINAL。

## 5. 最小版本变化提案与兼容矩阵

这是输入契约变化，不是只改文案。建议分配下列明确候选号，尚未修改常量或登记resolver：

|语义/实际字段|旧内部候选|新绑定候选提案|原因|
|---|---|---|---|
|engineVersion|0.1.0|0.2.0|native上下文/配方/校准/记录合同；图形和时序政策不改|
|scoringVersion|0.2.0|0.3.0|接受并校验新core绑定合同；数学公式/有效分母/方向/null不改|
|configVersion|0.2.0|0.3.0|stimulusRecipe由null变完整对象；status改CONTENT_CANDIDATE，非发布权限|
|profileDefinitionVersion|资源层当前派生0.2.0|按当前规则派生0.3.0|profile patch输入结构变了；仍100/25|
|protocol key/version|enumeration/0.1.0/0.1.0；0.1.0|enumeration/0.2.0/0.3.0；0.2.0|新输入合同版本，旧不改名；不把key中的旧数字解释为当前scorer事实|
|presentationVersion|0.1.0|0.1.0|实际绘制/指导语/输入/单次时序未变，不因上下文格式升级而虚升；若后续setup或交互实质变化，另评估|
|metric/quality/reportDefinitionVersion|各0.2.0|各0.2.0|无指标语义/纳入/报告内容变化；将来若动这些须另升相应层|
|randomizationAlgorithmVersion|现有枚举FNV/Mulberry32/Fisher–Yates|保留原值|数量/滑杆随机流不改；新recipe ID导致的点位身份变化已声明|
|任务局部Artifact/Record格式|v1/旧JSON摘要|native v2/canonical|不重写旧原件，不增加normVersion/总版本字段|

新native context使用新schemaVersion及usage=AUTHENTICATED_CONTENT_CANDIDATE；旧INTERNAL_REVIEW_ONLY上下文和synthetic fixture保持旧身份，不能只换usage字符串或用类型断言“转正”。source/status/科学成熟度分别记录，PUBLISHED仍由真实发布链决定。

允许：旧tuple+旧null配置+旧内部v1原件只按其原合同读取；新tuple+新精确配方hash+真实自报校准+B/F+新native v2格式。拒绝：新engine配旧null/合成来源；旧engine配新B/recipe；未知recipe/id/hash、profile数量不匹配；版本/语言/realm/引用混用；同attempt换校准后继续曝光。旧scorer对比用原数据，不能构造假旧tuple把新记录送进去。报告0.2仍必须与各自冻结engine/scorer/config组合明确允许，不“找最新版”或补签旧浏览器报告。

当前nativeVersionFacts对enumeration从单一ENUMERATION_IDENTITY取版本；若后续同时保留旧/新定义，必须改为按精确tuple取事实，不能用新常量覆盖旧tuple的config/profile版本。此点是实际消费者差异，不代表本轮已改registry。

## 6. 精确文件与阶段界线

本轮只新增本目录文档/JSON。后续获根dot批准后的预计文件（前缀均server-version）：

|位置|所需最小变化；当前未实施|
|---|---|
|backend/src/modules/cognitive/content-candidates/enumeration/native/{contract,recipe,schema,presentation-binding,definition,scorer}.ts（建议新增）|新精确tuple/config及payload合同；旧protocol/schema/scorer保留原身份；纯算术复用不得伪装旧tuple|
|backend/src/modules/cognitive/unified-final-submit.service.ts，现prepareAuthoritativeScorerContext前|仅新tuple的真实session/epoch与F核对；不扩全局原始payload/provenance|
|frontend/src/modules/cognitive/tasks/enumeration/display.ts|区分旧内部与新native上下文、配方和calibration绑定；不是解除全部校验|
|同目录capture.ts / persistence.ts|新增v2引用/header/hash方案；现有绘制、采集/时序和中断政策保持；旧v1不重标|
|同目录EnumerationTask.tsx / enumeration.css|只适配已核新上下文类型；本合同不改已批布局/CSS。若实现必须改变刺激/输入/布局，另出示意图人工确认|
|frontend/src/services/persistence/finalDraftStore.ts|既有META命名空间原子冻结需身份和不变hash校验；现有浅合并不能冒充已具备|
|scripts/cognitive/enumeration-content.cjs及新native纯定义投影文件|现脚本只复制旧protocol/report；后续需独立新投影，不能覆盖旧生成文件的语义|
|backend/.../task-resource.ts及native-registry/definitions.ts|后续精确多版本事实/读取兼容；本轮禁止改/登记新包|
|frontend/.../NativeEnumerationRunner.tsx、native-runners.tsx、backend/prisma/seeds/native-cognitive.ts、task-resource delivery、raw-archive.service.ts|均是之后的真实接线阶段，本轮不实施；完整A/专属raw schema依赖本合同|

最低后续验证建议（只是计划，未执行）：静态配方实值与canonical bytes；旧/新tuple兼容；校准缺失/合成/篡改及viewport变化；B/F/首正式引用/真实session错配；同epoch首次冻结与变更冲突；旧realm只重试原包；正常/limited/invalid gate及缺答保留。只对实施后真实受影响项续验，复用未变计分和宿主原件。没有为这份文档重跑任何测试、画图、浏览器、计时或COS分析。

本轮开销仅静态读取/摘要/文档审阅，主要位置为既有云端；源码/锁/配置输入不变的旧测试不跑。唯一准备失败为绝对tsx/cjs路径不走package exports，已改createRequire按原锁定包解析；原记录在document-build-receipt.json。这不是任务、科学或业务测试失败。待根dot亲读这份完整合同及配方实值后，再安排接线；不要求用户承担技术半成方案选择。
