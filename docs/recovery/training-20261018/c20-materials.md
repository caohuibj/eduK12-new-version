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
