# C20 材料实验：checkpoint 01（开发中）

基线 c0cd98296915b7006d0f98495b75e18198647bd8 / tree54e1a8c8e5d00791ee30179d939d8a8a247eef93。仅当前 assistant 云节点，独立 worktree/deps/fresh Prisma；未 push、CI、merge、生产或 Mac 操作。本 checkpoint 是可恢复 WIP，不授 C20 功能、C25整合或 C26性能资格。

## 变更与检查边界

公共材料 schema/纯分配计划及 Survey 兼容适配 → 固定旧编译器 golden、错误次序/hash差分、确定性draw区间及quota/继承/事务适配；Training V2编制/分配/restart/path/报告导出 → 旧V1/null及组合拒绝、真实PG生产dist四工具和竞态；四表加法迁移/权限/不可变发布 → 正式runtime role/guards/旧4054行与非空dump restore；前端V2编辑和凭证轮换 → 定向类型、组件、build，正式浏览器仍C25。主要执行位置当前隔离节点，同输入只测一次，失败仅针对性续验。首次约20–25分钟恢复点，最长30分钟；各真实分项约5–20分钟，超预算报告具体阶段。

## 明确协议

- 旧 schemaVersion1 flow 及全null不加默认字段、不重算历史hash。新材料 schemaVersion2 复用C19 blocks/scanner/native，experiment 独立于 C14工具子集分卷。
- 2–8组、weight整数1–100；材料纯文本；可选quota每组1–10000，明确是分配机会，SCREEN_OUT不退额。仅余额组按权重抽，满组去除后为quota-weighted，不承诺精确比例/人数。
- KEEP_LINKED持久scope为owner+真实course+experimentKey+组键合同，登录主体使用唯一索引关联；普通匿名新链接不关联，restart沿原主体/claim。
- 四新表只存scope、唯一subject binding、发布/config/group配额桶、不可变claim。材料全集只在不可变trainingFlowFrozen，attempt既有candidate snapshot升级为V2，仅增加13标量materialAssignment字段，无材料候选全集；path只保存实际展示一组材料，proof绑定assignmentHash。
- participant返回仅已分配材料；teacher/researcher报告最小四字段provenance，CSV增加M_assignment_hash/M_group_key/M_material_digest；analysis来源指纹绑定assignment/path。
- 准入锁definition→（restart公开token→原attempt）→原user/course/release/asset→experiment→稳定bucket→binding/claim；首到达native/认知quota、材料quota、token usedCount同事务。恢复/GET不分配、不写材料quota。V2首native已纳同事务，未达不创建。
- restart任何普通匿名保持服务端锁定participantKey，随机新credential，同事务撤旧hash；失败保旧凭证。C20已接受任一FINAL不可restart；合法restart保claim/group/quota，重新绑定新attempt/epoch/hash，次数含ABANDONED。旧C14新attempt分配合同不改。
- 材料可独立或与已支持C19条件/END组合；继续双向拒variants/anonymousStudy/关系/报告包/复杂policies/optional native/额外条件语言。C21–24不顺手实现。

## 当前有限证据

公共worker：5个定向文件66 tests通过（48+18分批），含19旧Survey编译器golden及7quota fixture；不计为19+7额外测试。旧编译器来源固定c0cd982，日志与golden保留。共享算法无数据库依赖，Survey身份/事务/历史take100原样，不把其历史扫描复制到Training。

Training开发定向：6文件137 tests通过，覆盖新V2纯流/包身份和既有C19编制、consumer/finalizer/aggregate；随后少量scope/CSV/analysis/restart-token锁变动仍须受影响续验。此轮无生产dist/HTTP资格。后端tsc01初次报一处Prisma JSON静态类型，已修，尚待冻结构建；两次命令工作目录错误在任何检查前MODULE_NOT_FOUND，原日志保留，不计测试通过。

迁移：独立真实PG最小父表fixture初轮8 tests通过；其中“发布可改”旧预期随后被更严格V2冻结不可变合同替换，不能复用那一项。新增/替换3项通过，7未改项未重跑。原始首次仅工具输出，后补transcript明确来源，不冒原生tee日志；续验具before/after source manifest+log SHA。正式全库迁移/role/非空恢复未运行。

## 尚未完成

固定business输入build及受影响回归、完整真实HTTP/PG四工具、普通匿名/null与材料restart及四native能力撤销、KEEP跨发布/跨scope/满额、最后一个配额和双restart真实等待、故障回滚、报告CSV分析严格消费及10/20/50真实completed成本、旧事实和四新表非空恢复、独立review。新c20分项harness正在编写，未运行。原C19 state08只读；所有失败producer保留。

## Checkpoint 02：review修正与分组分析（仍为WIP）

- 全部公开start/restart统一definition→token→oldattempt顺序，锁内再验证身份/凭证；experiment仅SHARE，登录KEEP_LINKED首绑定以域分离的scope+subject advisory锁线性化。真实双waiter证据仍待运行。
- 配额claim新增可空reservationOrdinal，仅新quota claim使用；唯一发布/config/group/ordinal索引、counter只能逐次+1、双向命名deferred约束以索引exists保证每次增加恰有claim，不扫描历史COUNT。旧表/旧attempt无回填。初始bucket仍必须0且cap/config/group完全匹配冻结发布。
- Survey材料presentation恢复旧JSON键顺序；新增固定旧base的Survey输出字节及V1 pending/completed path golden，不用当前代码自算预期。
- V2分析每wave必须显式materialGroupKey，发现列表按组提供选择，按已验证材料scope过滤后才读计分facts；alias、字典、manifest、long CSV、来源指纹均绑定组。旧null/V1不添null默认字段。不同组不会无提示合并，现有描述/配对规则可比较显式选中的条件；未新增因果估计器或scoring身份。没有新增逐人claim表查询。
- 前端材料编辑、配额机会语义、maxAttempts和成功restart后恢复凭证缓存轮换已接入；79项既有定向测试、类型/scoped lint有独立证据。新增分析组件23项通过；正式browser仍未运行。

有限构建证据（各目录均在worktree同级，运行前后source manifest保留）：c20-build-01七个原构建前置成功后tsc两处类型错误，均已修；c20-build-02为58通过/44失败，失败是旧analysis mock缺C19持久null markers，已仅修fixture。c20-build-03四个analysis文件129 tests通过、完整backend tsc通过、sourceUnchanged=true及dist-manifest；先前成功前置输入未改不重跑。c20-ordinal-01新独立PG16最小父表的ordinal目标用例通过，非完整runtime角色资格。c20-frontend-02新增分析23 tests通过后route inventory陈旧失败，失败保留；派生文档同步仅匹配现有未改路由，后续类型/build另记。

全部真实PG生产dist HTTP分项脚本已编写，不能以语法通过代替运行。当前未获得C20功能GO、正式role/非空恢复/竞态/成本资格。C19动态suppressed独立断言、已测longCSV逐列assert和新fresh/browser/selected-video仍留C25，C26容量另验。

c20-frontend-03：原inventory与session-auth门、app/cognitive两套tsc、Vite production build均通过，sourceUnchanged=true；只有既有chunk>500kB提示。路由派生修正的三个输入相对remote58完全未变，App最后变更为085fddd9（C10），保留历史深链接的局部授权和服务端新准入限制，未改运行路由。App/OrganizationRoutes/generator SHA分别af47d7ac8670aa45cdcc5dea2f34d00e0fe44af550d0eba5a7ffa7c5130d8114、7ff4d523067cd480a58a4c83a681628b61271eed29af392569e2f6e0fdd76f19、20c3239789f1f5fcb5fdf67cf506642ee779bee2f5e6f373d0de82cd0327d222。

## Checkpoint 03：首个真实主链及有限复用

state01全库升级通过：211→215表、174→175迁移；pinned C19 dump精确恢复、原事实及guards保留、正式restricted runtime role apply/verify通过。main首次因harness大写groupKey被官方schema正确拒绝，仅已有资源fixture/六item draft，无parent/FINAL；失败原件保留。修小写keys后纯schema预检14正向配置，另列非法负例，此项仅准备检查。

state02为准确续验，绑定state01 receipt、失败result、私有fixture和既有draft，无seed/旧FINAL重交。真实Form→Scale→120-trial Cognitive→SJT四FINAL及精确重放成功，共4facts+1原outbox；按需准入、未达工具/whole/media拒绝、quota及最终GET/report闭环通过。cleanup/source/input均true。其原receipt SHA370ea04c56130cc9947df0008de81232b4da1ae5716c4c64f37f8759b139f935；不冒原main producer全部重新成功。

后续launcher增加phaseProducers保留实际argv/脚本SHA/冻结输入/父receipt。state02历史main只能按明确continuation+唯一新phase导入，历史argv=null；upgrade明确为已验证receipt引用。旧结果及旧phasehash原样不回写。独立两review均对业务源码限定GO；动态匿名/KEEP/竞态/故障/消费者/恢复仍待。

成本脚本冻结为固定51主体、a50/b1、两publication102parents/204FINAL，按a层10/20/50与真实导出总n+b分别测。另以固定anchor比较同task1/2目标组，API最少2waves；FULL_CASE互斥组空匹配不能解释为优化收益。同task不同group每wave仍重复graph是有界P3，记录SQL/返回行/解密量，不宣称跨组一次load或C26容量资格。

state03（失败aggregate保留）：匿名V2四first-native恢复/restart/旧能力撤销、KEEP跨发布/满组拒绝/跨scope/maxAttempts通过。race首两项最后1配额与同attempt双restart各观察两个真实PGwaiter，均无部分残留；随后null fixture token的Date.now+1h晚于product的先前+1h而被400正确拒，非业务放宽。续验仅修稳定有界expiry，补未完null锁序及此前缺失的null/V1完整凭证轮换、跨两publication KEEP首binding advisory竞争。

新增显式continuation-phase可与all共用，严格绑定失败phase/旧receipt/已过子项，逐phase记录实际producer；旧state02无phase仍唯一new-main规则。显式续验自身若失败，保留failed结果SHA且仅验证导入，绝不列accepted。静态receipt校验目前15项通过仅有工具transcript，未冒原生保存日志；新V1官方schema/有界token准备检查同样不计动态功能。下一state04尚待运行。

state04失败aggregate保留：null双真实PGwaiter、主体/凭证与旧native拒绝及replacement新FINAL执行后，原epoch2报告job已真实处理至READY。harness共用drainReports最后固定epoch1查询导致No CompositeReportJob found；不改业务、不造job、不重交该FINAL/重跑worker。state05精确绑定失败result+私有journal，先只读核epoch2事实/READY，再补既有四V2旧credential访问replacement拒绝；新V1局部按实际epoch处理原outbox，随后未运行KEEP首binding及余下分项。共用client保留，避免失效已合格输入。state05尚待实测。

## Checkpoint 06：真实消费通过，导出效率预算失败保留

state05 的 race 精确续验通过：旧null replacement epoch2 completion只读确认；四V2旧credential跨replacement拒绝、新credential读取成功；新V1普通匿名稳定主体/轮换及实际epoch2原outbox；跨两publication同登录主体首KEEP绑定竞争观察两个真实PG waiter，最终一个随机、一个继承、一个binding。noWrites只覆盖census与quota/token hash，并非全部facts字节比较。rollback、branches、revocation及consumers通过，包含真实报告/Redis导出/分层分析和撤权下载。C19旧suppressed/longCSV缺口仍未因本期新用例自动关闭。

consumer-cost 原失败原样保留：51真实主体(a50/b1)、两publication102parents/204FINAL已完成；在a10/20/50人口阶段，实际导出总人数11/21/51，SQL为40/61/121，严格预算拒绝。analysis SQL40/40/40；单份teacher report22/22/22（不是批报告吞吐）。导出两个按人SQL形状精确对应既有Scale loadScaleResult与loadScaleAnswers各自单身份loadScaleFactRecords，2N查询；另1条SELECT 1为连接探活，非分块阶跃，也非材料history扫描。graph/snapshot/Scale/FormAnswer批次数固定。原生产输入/服务清理均已验证，sourceHead仍是C19 seed，实际执行HEAD为567622ec。

观测只代表单串行真实PG输入：analysis耗时108.79/147.57/251.80ms，解密126/246/606次、明文185241/360139/884801 bytes；单报告17.90/17.14/13.78ms，解密3次5175bytes；导出65.19/90.25/128.88ms，解密44/84/204次58920/112488/273168bytes。不从固定SQL推断固定行/字节，不作为容量结论。当前尚未收集CPU/峰值RSS等完整效率数据。

最新执行顺序：先完成剩余C20功能/guards/restore并提交功能checkpoint，保留此效率失败；随后同原51主体数据独立做云端CPU、内存、数据库、存储和访问成本测试/优化，再第二次提交。C21及后续新功能暂停。当前cost（准入/恢复/继承成本与2/8候选材料存储形状）、guards和restore未运行；失败后未到达的组别手算/最终计数由明确独立functional-tail补齐，不把consumer-cost失败变成通过，不重造fixture或重交FINAL。

state06：独立consumer-functional通过，精确保留state05的51主体/102父/204快照/102READY；A50=1、B1=0独立手算、两publication显式分层、固定anchor的同task一/两组来源集合正确，前后目标facts/raw/report/claim/binding哈希及census不变。原consumer-cost false未提升。

cost尾项失败保留：cold首claim/warm恢复/已有start/restart/linked新发布/满额拒绝六窗口依次观测API SQL94/39/50/92/93/32，耗时97.98/33.35/43.04/75.01/71.78/30.09ms。两份真实2/8组准入中candidate明文等长、无材料正文断言通过，但跨不同随机身份内容的cipher精确等长断言失败（2组919B，8组911B）。既有ekc1使用gzip level1再AES-GCM/base64，UUID/hash内容导致压缩长度差；固定IV/tag长度的随机nonce本身不会改变总长。此断言不能作业务失败或用猜测容差改成通过。下一明确只读storage-functional检查精确codec长度公式、严格最小候选字段/规范化结构和仅已选材料；不重建两份准入、不重跑六窗口，仍保留cost原false。guards/restore尚未运行，功能checkpoint仍未完成。state06全部服务停止、源及输入未变。

state07：storage-functional真实只读通过，原2/8组candidate严格顶层及assignment键、空工具refs、相同materialDigest、已选材料与规范化结构一致；每条header声明明文字节/digest、gzip生产参数及固定28字节IV+tag的base64长度公式准确解释919/911。原六窗口仅引用，原两失败维持false。

guards完成前17项：四表受限role UPDATE/DELETE、初始counter/cap/group/config、claim缺ordinal/跨config/跨bucket、counter漏claim/跳2均正确拒绝。duplicate ordinal实际由PG SQLSTATE23505拒绝，Prisma返回完整五列key冲突详情，但harness误要求消息含constraint名，故原aggregate失败；不扩大为业务缺陷。只读比对storage-functional-post-state和最终DB snapshot严格相等，所有guard事务无残留。下一精确guards续验核正式pg_catalog唯一索引/列及结构化SQLSTATE，再above-count与restore；不重跑前17项、不放宽数据库规则。所有服务已停/输入源不变，尚无完整功能GO。

state08：在任何新应用phase执行前，TCP端口可连但PG尚处starting up，首次只读snapshot收到FATAL。launcher缺少数据库协议级就绪等待，失败单独保存；最终snapshot字节SHA仍073393eb60ace3423cdfe33b3f7b1f8d0eb0eb873f156de0297f037c14312389，与原state07严格相同。未重新执行17旧guard或新增FINAL/准入。后续仅补有界认证SELECT1就绪，结构SQLSTATE57P03可重试，其他错误不吞；从原state07精确续guards/restore。所有服务清理和源/输入不变已核，仍待完整功能资格。

## 功能 checkpoint：state09 分项链收口（效率优化前）

state09 已完成全部13项功能/存储/恢复producer链，functionalCheckpointPassed=true；原consumer-cost效率失败及cost测试的无效cipher等长断言仍原字节/原SHA保存，因此顶层passed=false、efficiencyQualificationPassed=false。该标记设计不伪造旧失败为通过，独立storage-functional已以实际codec精确公式关闭存储功能问题。这里的13项是producer阶段，不是13个独立测试用例；不相加HTTP次数或复跑次数。

- 真实生产dist四工具Form→Scale→120trial Cognitive→SJT主链、原FINAL/outbox/replay、候选/path/分组provenance；普通null/V1及V2匿名稳定主体和凭证轮换、旧父/native及cross-ID能力撤销。
- 登录KEEP_LINKED跨publication继承/满组拒绝、跨teacher-course同名隔离、maxAttempts与ABANDONED计数；最后1quota、同原attempt双restart、同主体首次KEEP绑定均有真实PG waiter证据；故障事务quota/token/native回滚。
- 条件/材料/END与拒答、已达恢复/未达撤权拒绝；真实报告/CSV/ZIP/analysis分组来源与下载撤权。原51主体a50/b1、102父、204FINAL/快照、102READY原outbox保持；A=1/B=0手算分层与同task一/两组固定anchor来源集合已独立验证。
- 受限eduk12_runtime真实19项guard边界由原17项及最后2项分项producer组成；正式五列reservation UNIQUE索引结构/23505重复ordinal、P0001超已预留ordinal与全四表回滚projection核验通过。不会把重复执行第18项算作另一用例。
- 非空四新表恢复：136 claims、19 experiments、48 quota buckets、70 bindings。全215表projection、104 public guards及列/约束一致，正式runtime role恢复验证通过；仅沿原73项跨dump ordinal差异和3项CHECK PostgreSQL重解析白名单，同库比较始终严格。
- 本期源为C19 state08，211表4310原行全部保留，historicalRows SHA308cf3673338aa5754d2f0a43ad25afb35f6517a7227f66aa02c51b2bd80fe9c，原guards/constraints不变，仅白名单3个加法identity guards。4054是更早历史子集，不能与本期4310混写。

实际执行HEAD dc3ba73e9f915bf24ee14396836b3daa09bdfb7f，业务源码/Prisma自92986ff1后未改；runtime.sourceHead仍表示C19 seed，不是当前执行HEAD。state09 runtime receipt SHA2c2b36735802dedcba5cf905bdce1c8430b1756cc86f8f78c8e127f7c15f77a5；非空私有dump c20-new-format-restore/c20-http-new-format.dump SHA ceee3749d21dead15d1c838d945131fd18c3b7d6accfa58212fce287c4bfdb9c。原C19固定dump SHA c93890e3958e905304254225c9c94879690a0c37da13755a462fc77103c6dd15保持。全部服务停止，cleanupVerified/sourceUnchanged/inputsUnchanged/priorSourceUnchanged均true。

功能限定证据归档checkpoint10包含20个脱敏原结果/frozen/schema projection成员及原/压缩SHA/size，不包含私有DB、runtime凭据或HTTP私有journal。schema projection只有计数/hash和数据库结构，不是原行数据。所有先前失败均留存。独立源码/测试/恢复review由root归档；本功能checkpoint不含完整新fresh/browser/selected-video、CPU/RSS广义资源或C26容量资格。C19旧动态suppressed与已测longCSV逐列两个缺口仍留其后续验收范围。

下一阶段按用户最新顺序：先保护本功能提交，再以同51主体精确stage ID/dateRange基线做云端CPU/内存/数据库/存储/访问数及单次/并发2资源观测，明确Cognitive/SJT独立新四工具probe而不外推Scale/Form；只优化已证实Scale导出2N读取及证据支持的问题，第二次提交后停止新功能，交root启CI和合并。C21及后续新功能暂停。既有导出SQL40/61/121失败不得改写，analysis40/40/40与单报告22/22/22只是既有串行观察，不代表恒定读取bytes或批吞吐。

启动就绪新门是有界认证SELECT1，仅结构57P03可retry；60秒循环末次子进程最多8秒，另有前置TCP等待，不能描述为整个启动严格60秒。state09真实首轮认证成功，静态分类不冒充真实57P03分支运行。

## 独立效率基线准备（功能 checkpoint 之后）

本次新增 recovery-only observer、launcher 与两个 producer；业务源码、Prisma 和已接受 dist 保持功能基线。执行 HEAD 与功能基线 11feee92 分别冻结，只有精确业务输入一致才可运行 before。原 state09 只读，独立克隆；先读取原 51 主体固定 11/21/51 每发布样本，再至多新增三个 Form/Scale 资源链（单次一条、并发二条）及一条四工具链，共最多十个新 FINAL。旧 102 父、204 FINAL 和原 outbox 不重交、不重放。若旧四工具发布/授权过期，仅允许通过原测试 API 新建等价合成资源发布与合法授权，记录不同身份，不能延长旧记录或冒用其功能资格。

观察窗口分别记录 API、直接 producer、在 producer 内实际执行的原 report/export worker，以及 PG/Redis/独立 observer 的 CPU 与采样 RSS；返回行、分层解密/读取密文字节、响应/CSV/artifact 字节、关系/索引/数据库分配量和 PG 累积计数另列。统一 runtime 解密计数只是该层子集，不与嵌套底层重复求和。100ms 峰值可能漏掉短峰，CPU tick 有量化误差，PG 统计有延迟；observer 自身原始开销不盲目扣除。已有输出 rows 仍整体物化，不声称流式或容量收益。

固定消费顺序、actor、选项、精确 ID/dateRange、事实及 assignment hashes；前后 CSV 必须逐字节相同，无自动 metadata 豁免。已知 2N 原失败保留，before 收集该缺陷而不把效率预算标为通过。之后仅对受影响导出做有界请求内批量读取优化及同输入 after；超出批大小应按分块阶跃解释，不能用无限 raw 常驻换固定 SQL。当前仅为已冻结准备范围，尚无本阶段动态 CPU/RSS/效率结果。

### state10：优化前资源基线已完成

执行 HEAD931dd90c，runtime receipt SHA ba9a08e16b6acfebb3a4c2a61e31ebffd14ea00ce312d5beb5e71b9fbd0fcd6c；passed、cleanupVerified、sourceUnchanged、inputsUnchanged均true。消费者30窗口、资源链/idle33窗口是63个观察窗口，不是独立用例、重复统计样本或容量GO。原51主体/102父/204 FINAL全行及相关facts/outbox哈希保持；另四个新资源父正好十个FINAL，单次、并发2和四工具各已READY/report。四工具因旧授权临近过期采用新course/new publication/exact-release grant，同原Scale/Cognitive来源及原quota计数，旧publication/grant整行哈希不变。

固定渐暖顺序下，两波11/21/51人的direct导出SQL分别40/41、61/60、120/120；探活SELECT1造成±1，Scale facts/raw两个按人读取仍存在。51人两波实际返回facts密文字节101284/101212、raw均17442，直接producer CPU(user+system)208728/146383μs、耗时193.52/143.14ms、100ms sampled RSS峰334135296/340578304B。这些是同序列受扰动原始观察，不能用两波差异声称优化或规模因果关系。旧40/61/121失败仍保留。

实际新链：单次准入137.28ms、并发2外层准入144.42ms、四工具准入142.65ms；120合成trial Cognitive FINAL87.61ms，SJT FINAL116.17ms。报告worker在producer中执行，drain窗口还包含test-only非目标job行锁隔离的setup/release，因此不是纯worker成本。最后两个约30秒idle窗口，API末RSS376487936/376496128B，producer末RSS345702400/345710592B；不据此证明无泄漏或长期稳定性，不模拟浏览器/人工作答时间。

checkpoint12保留两个独立observer原始accounting JSONL的逐字节副本、全部63窗口资源值、冻结输入及就绪/总结果。消费者/chain结果仅移除request route字符串，并明确记录原文件SHA和变换版本；不包含runtime凭据、HTTP正文、DB或私有CSV。每窗observer通常另有20个查询，三次全库relation-size/stat快照及250ms activity均计入原始PG/WAL/IO；自身CPU/query开销单列，不简单扣除。before原始数据库来源是state09；after须从相同state09起点按同消费者序列和精确IDs执行，不能拿含新增10FINAL/artifact的state10尾库当等价起点。

## 效率 checkpoint：有界 Scale 导出读取与 state11 同输入验证

业务实现冻结于 f37d95b31aad69b8fde706b90f01705f3ccb0c50，仅修改 assessment-runtime/compact-assessment-storage.ts、assessment-runtime/scale-fact-records.ts 和 composite/composite-export.service.ts。授权及选定 graph/scope 之后，按原顺序请求内预载最多64条、估计最多1MiB的 facts/raw；先用长度投影规划，再读取正文。1MiB是密文加声明明文的预算，不是 JavaScript heap 上限。已有 graph 和输出 rows 仍整体物化。超大单行、legacy引用、metadata/批量读取失败沿原逐行路径，不新增拒绝；完整 whole parser、身份/epoch/submission/payload绑定及逐行错误语义保留。只有已经纳入预算的 receipt 才缓存 whole 解码 body，未规划 legacy fallback 不驻留；每批及最终均释放请求内引用，不使用跨请求/跨actor缓存。超过64条或字节预算按有界分块增加SQL，legacy/oversize/fallback不承诺固定查询数。

最终同源资格为 build-03 的9个直接受影响测试文件、185项通过，以及 build-02 的当前 f37 TypeScript emission和新launcher篡改 frozen-inputs负例。build-01 的8258输入184项、build-02重复定向14项/13跳过仅作为各自历史记录，不相加为最终用例数。七项未变build前置的425文件保守输入闭包与原成功记录逐SHA一致，保留复用证明；本次执行的是等价官方tsc阶段，不能称重新执行了整个npm build入口。after绑定同时验证固定before runtime、before sourceInputs digest及原consumer producer SHA。

state11从同一state09源重新克隆，执行相同30个消费者观察窗口、同actor/精确IDs/dateRange/选项/顺序及同仪器。未新增FINAL；原51主体、102父、204事实及source/assignment绑定保持。六份direct/download CSV均与before实际字节一致。runtime receipt SHA c9569b14b5d182d09ff3e4006e98bac90f2ca270b44b3b609f26da4477e7a373；passed、affectedExportSqlBudgetPassed、cleanupVerified、sourceUnchanged、inputsUnchanged均true。原state05 consumer-cost及state06 cost失败仍原SHA/false留存，新资格不改写旧结果。

| 实际人数/波次 | 原始SQL before→after | 仅去SELECT1的SQL | producer CPU μs | 耗时 ms | 100ms采样RSS峰 B before→after |
| --- | --- | --- | --- | --- | --- |
| 11/0 | 40→20 | 40→20 | 71834→75382 | 68.71→71.75 | 267243520→266584064 |
| 11/1 | 41→21 | 41→21 | 45138→45903 | 43.98→46.60 | 273260544→277049344 |
| 21/0 | 61→21 | 60→20 | 89240→75183 | 68.88→61.68 | 295542784→318193664 |
| 21/1 | 60→21 | 60→20 | 78342→53546 | 78.42→52.87 | 315539456→319176704 |
| 51/0 | 120→20 | 120→20 | 208728→137748 | 193.52→117.11 | 334135296→337108992 |
| 51/1 | 120→20 | 120→20 | 146383→92290 | 143.14→85.18 | 340578304→338087936 |

补正上节“SELECT1造成±1”的概括：实际SELECT1只出现在before的21/0及after的21/0、21/1窗口。11/1还有一条 assessment_public_templates 的单hash读取，形状SHA a00f6366d60309ad467627c565c8985267c4d3f88cb98c743bc1f0bf759af621，不能把所有常数差都归因于探活。原始及仅去SELECT1口径均保留，不删除真实公共模板读取成本。

六窗口facts密文读取分别21844/21804/41716/41676/101284/101212B降为10922/10902/20858/20838/50642/50606B；raw读取仍3762/3762/7182/7182/17442/17442B。返回顶层行数70/71/130/130/310/310未变，长度metadata行替代重复facts读取，不能把facts密文减半描述为全部网络字节减半。两侧30窗口包络数据库分配量均72801303→72809495B，增长8192B；六份CSV artifact合计均102784B；observer自身均601查询，原始PG/WAL/IO保留其开销和窗口间活动，不盲目扣除。

这些是同序列、渐暖缓存、带observer扰动的单次匹配窗口观察。11人两波都略慢且CPU略增，RSS结果混合，21/0增加22650880B，51/0也增加；不宣称全面更快、更省内存、统计显著收益或容量GO。100ms采样可能漏峰，VmHWM是进程lifetime，PG新建/退出backend首末采样可能漏CPU。可靠限定结论是本次相同51主体范围内六次导出SQL由40–120降为20–21、重复facts密文读取减半，科学输出/授权绑定保持。state10另含单次、并发2和一条四工具新链的资源审计，覆盖发布/准入/state/FINAL/report/analysis/export观察；其合成120trial不是人工作答或浏览器时序，after没有重放这些未受影响新链。

checkpoint13-efficiency-after.tar.gz含24个脱敏成员，1404676B，SHA f3323cee26956a95f57cb8ec5f5f170df6b9929099c7a088ef1d2d49f28b105b。包括state11原始observer、冻结输入/结果、精确原after contract、前后比较、最终及历史测试日志/源绑定和前置复用证明；消费者结果仅移除request route并记录原SHA。不含私有DB、凭据、HTTP正文或私有CSV。before的checkpoint12及全部旧失败继续保留。

功能与受影响导出效率的独立review收口后，交root保护提交并运行获准的正式受影响CI/PR流程。本轮停止新功能；C21及后续暂停。browser、新fresh/selected-video、C26容量及既有C19两个独立缺口不在本次效率资格内。
