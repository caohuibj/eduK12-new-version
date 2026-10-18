# C19 条件流程：checkpoint 01（开发中）

基线 b5731061f25485a80a46111e77f54fc4d8866dd1；本 checkpoint 是可恢复的实现中间点，不是 C19 功能验收通过。仅当前云节点，未 push、CI、merge、部署。C25 浏览器/整合和 C26 性能不在此结果内。

## 冻结的最小合同

复用 assessment-core/flow 的共享 AST、schema、输入预算、compiler 和 evaluator，Survey wrapper 保持原协议/hash。Training 仅引用此前已接受 typed Form SINGLE/MULTIPLE/LIKERT 的稳定 itemKey/optionKey；未决不等于 missing，依赖已跳过来源时整个条件不执行，包括 NOT。64 blocks、64 predicate nodes、depth 6。

材料仅展示；END 冻结 SCREEN_OUT 或 COMPLETE_EARLY，客户端不能提交满足模式。筛出终态必 NOT_SATISFIED；正常/提前终态需至少一份有效作答事实且所有已执行 required 满足才 SATISFIED。Form有效回答不等于可计分量表分数；不制造未执行 FINAL、分数或零计时。候选定义/slotset不删改。

初版明确拒绝概率分卷、anonymousStudy/持久wave、关系投放、报告包、复杂delivery policies及optional native工具；旧全null保留原行为。编制、反向启用、发布均校验。

## 已落源码

- 共享纯核/Survey兼容、Training编译与权威顺序扫描
- 编制API、复制引用重映射、双向组合门禁
- 3定义列与4attempt nullable列，不回填旧事实
- 候选先纯prepare，复用现Scale/Cog共享runtime引用；到达后才父锁内创建原native child、认知quota；SJT保留原冻结snapshot并重验新准入授权
- 统一scope/marker投影、父state、whole拒绝、aggregate路径completeness与hash、报告/导出provenance的初步接入
- 最小前端与四FINAL父锁校验正在实施

## 有限开发证据

公共纯核：新26项、原Survey7项；原版→当前差分30个fixture输出/hash或拒绝issue完全一致。编制首次94/95，唯一Prisma.DbNull fixture修复后单项通过。aggregate分阶段29个不同用例通过，原失败/过滤复验保留。不得将断言/请求数当成独立测试数。开发证据的生产者输入详见归档；部分绑定仅开发结束快照，不能冒充每轮不可变资格。后端tsc-02诊断exit0时仍有活动文件，不属于候选冻结资格。

## 明确未完成

四FINAL锁内重检/快速replay、前端测试、持久化路径proof以避免每media重解密历史事实、完整旧marker fixture、真实PG四工具/权限/媒体/并发/任务统计/CSV、nullable非空升级/restore/正式role/cleanup、固定输入独立review仍待完成。当前新增migration尚未跑真实PG。不要运行旧C18 fresh-all并宣称C19通过。

## 后续主要检查与预算

每checkpoint最长30分钟备份。下一段固定build与scope/FINAL测试，随后真实PG生产dist四工具链和明确权限反例；最后新格式非空恢复与独立review。单次重型检查持工具目录measurement lock。旧null新增flow查询目标0；flow批量读取接受事实，不逐block查询；候选snapshot字节/查询/解密/实际child-session-quota计数单列，性能收益不预先声称。磁盘低于8GiB停报，不删除失败DB/历史证据。

## Checkpoint 02 增量（开发中）

修正每次接受 FINAL 后的非终态路径证据：在原 snapshot 后 outbox 入口，同一父锁事务写入 path cipher/hash；同步模式也写。读取须验证 cipher/hash 成对、parent/epoch/publication/config/slot 及快照头与实际密文 SHA；已有 accepted facts 或已 COMPLETED 却缺 proof 时 failclosed。只有同事务接受边界可显式推进，普通读不得自行修复。父锁内本次已验证 scope 可供同次 outbox completeness 复用。

批量导出预载全部所选 attempt snapshots，按实际 item/section 集合与 epoch 分组；分析复用已验证且身份/hash绑定的 request-local scope。每人的 proof 仍独立验证，不能当授权 cache。报告集合投影明确安全 flow provenance，compact SQL加载七列，量表授权 helper 使用本事务。初始候选与后续可达准入均检查 status/grant。

题级 NOT_SHOWN 显式抑制整个依赖条件，包括 NOT/OR；REFUSED/SHOWN_MISSING 为已决缺失，其 canonical 状态与资格仍保留。修正 runtime union hash 与 compiler 的 JSON normalization 一致性，避免合法 typed Form 的可选 undefined 字段触发 canonical error。

有限检查：pure+finalizer 首轮 11 失败（上述规范化缺口）/26通过，修复后37通过；追加隐藏题与proof完整性后48通过。消费者首轮18旧fixture缺nullable markers失败，补齐真实旧行的显式null后46通过；同批report projector/finalizer已通过，不重复跑未变输入。四FINAL guard相关72例中4项仅源码接线断言；前端6文件62例、app/cognitive tsc与定向lint通过，仍非浏览器资格。归档 checkpoint02-development 包含失败与分项续验；不能把重复用例相加。后端 tsc04 exit0，后续少量runtime改动须由新冻结build检查。

仍未完成：真实PG/HTTP四工具、并发双tab、媒体/恢复/撤销对照、非空nullable升级和dump/restore/正式角色、全部消费者动态反例、候选字节与成本实测，以及固定新版独立review。当前脚本仍由另一worker编写，未纳入此业务checkpoint。C19未验收，C25/C26未赋资格。

### Checkpoint 03：消费者绑定与独立 upgrade 生产者

新增19个消费者用例首轮发现2个 request-local scope 复用绑定缺口（缺 compositeId/publishedAt），已补齐；14个受影响scope/batch用例定向通过，5个未变报告投影用例复用首轮，不累计重复。尚未证明外部HTTP可利用此内部缺口。路径proof另显式绑定 contextSnapshotHash，防旧proof在背景上下文漂移时复用，其新反例待定向运行。

业务checkpoint02 的同输入构建已通过全部原构建前置与 tsc，1617个输入前后SHA一致、5133个dist文件留manifest；之后上述scope改动仅需受影响tsc重emit，未变前置不重跑。新增恢复launcher/db/upgrade已静态检查并独立冻结：upgrade仅消费DB迁移/schema/role/helper/工具，不绑定尚未消费HTTP脚本或dist；真实执行仍待。未宣称升级通过。

### Checkpoint 04：已验非空升级，HTTP仍待

私有state `/workspace/scratch/5a77e8bdc1ae/eduk12_c19_http_01` 已停机，upgrade passed/cleanupVerified/sourceUnchanged/inputsUnchanged全true。173→174迁移、211表、精确7nullable新列、4054旧行全保留、guards/constraints不变，固定C18非空dump对照和正式runtime-role apply/verify通过。upgrade phaseInputHash `42cf03574b3d6deab491fcd431f78907713f9136388c787744957fa26c766d38`，runtime-result SHA `c89eca5df666e80889301e7409c425c0279fa4bf69fdc7e6856c6163fcf3e6c3`，upgrade-result SHA `e7f00e75e9401dcf08afa940bfb80a86799b11b4bc3f8b9d1a7198ec2c419cae`。对应generated client manifest SHA `4f488f4c50f2f26273bc9d9ab8efffbb13f1131b1c3bb495e816235f1652535d`。此生产者明确 DATABASE_ONLY，不把并行HTTP脚本、dist、业务source或测试当成其输入/资格。

contextHash proof受影响finalizer19例通过，另追加pending current Form无快照正常与COMPLETED丢失accepted snapshot拒绝2例定向通过（原19 skipped复用）。教师partial source仅加载已完成测量facts，保留完整scope验证；未接受当前Form不要求不存在的facts，终态/已接受损坏仍严拒，真实教师HTTP场景待执行。消费者19个不同测试的2失败→14定向复验与旧5复用来源完整归档。

受影响tsc重emit成功，1397 runtime输入前后SHA一致，5133 dist文件摘要已存。checkpoint04 archive包含升级公共结果/输入manifest、两次build记录和上述分项原始测试证据，不含private配置、dump、原答案或凭据。HTTP、并发、revocation、media、CSV/分析和C19新格式恢复尚未取得资格。

### Checkpoint 05：中断后恢复并冻结 HTTP harness

执行窗口中断后，22:07 UTC已核对 worktree 全部成果仍在、state01已停机/无监听/postmaster.pid、state02尚未创建。未重新执行合格upgrade。6个源文件增量来自实现者的public discovery窄修；7个HTTP/restore脚本和test-plan来自harness worker冻结交付，归属已核对。

public list/info在任一flow标志非null或未加载时不返回候选union；flow的estimatedModules为null，前端明确显示“按作答路径逐步呈现”，不暴露候选总数或伪称执行数。遗留session实际exit0：新增marker4例通过、原21例skip；CourseDetail6例通过；backend emit/frontend app tsc成功。源文件恢复时SHA已记录，缺少这轮开始前的独立SHA文件，因此仅作为开发检查记录，不反填不可变输入资格。harness的Node24 --check/Python AST再次静态通过，尚未启动HTTP动态阶段。

下一步从state01只读复制独立state02，按冻结producer依次执行main/branches/race/consumers/restore，复用upgrade。额外shared-storage开关的canonical科学身份/实际child对照、revocation未达拒绝/已达恢复及四native完整越权组合仍待补充；不要求含attemptId和随机cipher的封装hash跨attempt相等，不新增公共digest字段。

### Checkpoint 06：state02真实失败与精确续验（未运行）

state02按641ee904冻结输入运行，成功复用upgrade。main完成合成资源准备/独立ADMIN review+grant且没有parent/native/facts/job，合法流程保存却400。原因是harness将教师section.items（没有native `type`属性）传入unitKey，误生成item_而非section_，业务compiler正确拒绝。只修formRows显式FORM，生产后端不改。新增纯回归执行真实fixture声明并调用原生产compiler，三题型条件编译通过。

失败state02已停止，cleanup/source/priorSource/inputs全部true；main-result SHA `84d3f4d212a02e0227c9eba5c65dfa1993193b541051139a61227b2ded2a9841`，runtime-result SHA `1388c8fef6d03254672507d1e31277c719ebbb846ea0f1aec44e384549053901`，frozen-inputs SHA `24b59af02808494ba52a840ced4c75333d81f09c012e1c2804789b49ad7567a5`。原失败档案保留，不覆盖、不重跑seed或已完成negative probes。

新c19-flow-continue.py及main-continuation只允许固定state02失败生产者，逐文件物理克隆精确校验、原4054行/guard校验，新增完整pre-continuation DB快照；查明恰一个六item DRAFT且无attempt后，从修正后的合法发布继续。未接受任何FINAL，不存在重新计分。原升级producer不变。尚未执行：free8.738GiB，复制约0.424GiB与512MiB保留后7.815GiB低于8GiB停线，已向root报告，未创建state03、未删任何DB/证据。

### Checkpoint 07：state03发布成功，首次准入500保留

root仅清理已完成C10的可重建依赖后，复制前空间预留9.472GiB合格；state03在c9def80c固定输入执行，原state02物理克隆与旧行保护通过，复用同输入upgrade。修正Form映射后合法编制、预检、发布成功，published编辑拒绝和nonmember准入拒绝正常；首次学生准入返回500，未接受任何FINAL。停机cleanup/source/priorSource/inputs全部true。main-continuation-result SHA `85130c16b9f095a92f92c5191df686def06e2c4d96050d157ec91d3ea316d676`，runtime-result SHA `f9f6b5c98cff4d0c2b73443504ff564ddf4da6945960380ce6020c28c69f3df1`，frozen-inputs SHA `4c2ecff866f5e1aff6aa93b4811638a55eeb2b9156e5d7663fed6b671278f199`。

静态定位候选assignment携带Prisma Date，与严格canonical只接受plain JSON冲突。原HTTP controller未记录内部异常，原500不能声称有直接异常栈根因绑定；新增定向producer将覆盖真实prepare方法的new/existing结果、原Date拒绝和修正后的最小DTO往返。全局canonical不放宽。下一精确continuation锁定state03四文件SHA，复用唯一已发布product及原成功编制，只在确认零parent后重试首次准入；不重新seed/发布/计分。旧续验脚本默认phase由无效main改为main-continuation，不影响任何旧执行输入证明。

新增assignment最小DTO：existing只保留后续实际消费的id；new显式保留创建字段，publishedAt转ISO，严格canonical验证所有必需字段，不静默吞undefined。actual prepare函数new/existing两路6个定向用例通过（DB mock），旧输入均复现Date canonical拒绝；新封装加密往返hash/毫秒精度/原persist函数消费通过，compact flag两值仅payload对照，不授shared-runtime/实际child资格。首次build04因错误Vitest CLI参数在加载测试前失败，原日志保留；build05修正参数后6例与受影响tsc emit成功，完整input前后不变。input SHA `dfa35572433519173f279844fe7e82d4bc75e049f9f098c503d0febd70df19df`，dist manifest SHA `85208e07d98e8907f660f3617ead86006f743c0884ef26249583f3f62dbeebb1`；未变原build前置复用，不重跑。state04仍待实际运行。

### Checkpoint 08：真实首段成功，保留原Form FINAL继续下一工具

state04在493196a8固定输入运行，候选冻结/首Form材料/未来工具与whole/media拒绝/零Cognitive配额实证通过。真实Form FINAL及精确replay均200，随后GET尝试准入Scale时403；loadComposite遗漏scale.creatorId，owner被原canUseScale正确拒绝。新增集中SCALE_USE_AUTHORIZATION_SELECT由实际loader消费，权限函数不改；owner、非owner有grant/无grant、缺creator/status的5行为用例及1源码接线用例通过，mock明确禁止借global DB。实际下一工具准入仍待续验。

state04停机cleanup/source/priorSource/inputs全部true；main-admission-result SHA `275f1eac67789552d2f04cb96fba0a8bbce8d3f77e2242292031eba3fab12747`，runtime-result SHA `2cb8fea2807b6d974a892b292ea38342e9e05781554c444ef7443dbf759f5dc6`，frozen-inputs SHA `082f7a10921fcaf3eb4f65570138f97a8303af397c70e4687e1ccc12b4869078`。新final-continue/main-remaining只绑定此失败producer；验证唯一原parent、一份已接受Form、原WAITING且未占budget的outbox、候选hash与原测量一致后，仅GET继续Scale，禁止重交/重评分原Form。

同时修正尚未执行的branches/race/consumers harness异步顺序：终态proof和PENDING原job先核，再通过原claim/process排空，然后读取COMPLETED/满足资格。后台worker关闭时不能在排空前声称父COMPLETED；不改业务状态、不手建job、不重置失败任务。新的main-remaining同合同。

build06六例和受影响tsc emit exit0。协调偏差导致测试完成后原测试文件从services移到composite同层，整个目录manifest为inputsUnchanged=false，原结果不覆盖。rename-continuity逐文件SHA和全路径集合证明仅一份字节相同测试改名，无其他新增/删除/变化，全部runtime输入不变且tsconfig排除tests。测试SHA `4a0f2eedb6691ed25925dc15ea0ba8d5f8fe3a34194be563329fb3f1e5bd6891`，dist manifest SHA `61ceaa9efbb9a2c255cdc163fe9ee64da22e145c247622828c28d195c2c9f5db`；窄复用由独立review核验，不能把总manifest改写成true。state05未运行。

### Checkpoint 09：真实四工具/END/竞争通过，SJT导出执行范围修复

state05在9ee45f69固定输入运行，正式runtime角色且原Form仅复用，真实Scale→120trial Cognitive→SJT FINAL/replay通过：4个accepted snapshots、一个READY outbox（真实claim attemptCount=1/requestedRevision=4）、父COMPLETED/SATISFIED。候选cipher 32692B/slot引用101B始终不变；Cognitive仅到达后创建session并占一次quota。END screen/early/refused分别满足既定完成/满足规则；public recovery计数一次、copy稳定键重映射、未决NOT与已跳过Form依赖抑制都通过。真实PG两父锁等待者竞争得到一接受/一replay、一snapshot/一job revision。以上各phase独立passed；不把HTTP请求或断言计成独立测试。

消费者已通过真实教师partial（Scale已FINAL、Form当前pending）和全case参与者/教师报告、cross-owner/cross-participant拒绝。随后原queued CSV失败`SJT export required snapshot missing`，由于导出仍按完整candidate required SJT要求事实。原失败batch `1af24ca8-3f5e-4402-8016-eee7dbb488b5` 保留，不重置/覆盖。state05已停机cleanup/source/priorSource/inputs全部true；main-result SHA `949efda914c824beec2f17e8931349e7bff95f9fc8384bc7d42c204554f5db8a`、branches `03ed00cae87624b757eedf494bba2394b93363543806d5e95641cc366d4834b6`、race `8b5010f6b47e7f6cab9766ff251385a67de2ac832fbee47f1e3b94183631f980`、consumers失败 `3e5bb8a511bc625d4c7ee59e6c511b66aa45c7aeaaab298af1da36ec4a52e46b`、runtime `a06536002435e07b668a7bd9ae579004f538091cd98d3fb3ce55d831e227b60c`。

窄修SJT reader只复用原request-local、WeakMap认证的完整scope，保持attempt/epoch/publication/config/slot/context/candidate/path绑定；仅明确skipped且不reached/executed的槽位不要求伪FINAL，输出NOT_SHOWN/空测量。已执行缺失、隐藏注入、wrong/forged scope和canonical损坏仍拒。原完整冻结slots不裁剪；普通/null/variants行为不变。flow复用原验证snapshot batch，不追加逐人scope或第二批snapshot查询。

定向84例首次81通过/3失败：两新fixture时间未规范为Date ISO、旧shared-plan mock遗漏现有factory。只修fixture不放宽生产绑定；新共享fixture影响24例及旧shared单例复验25通过/15skip，其他原通过文件字节不变复用，不重复累计。build08受影响tsc emit成功，input前后不变；input SHA `74ef4f3d4b55e3df3b1824d625d670afbdbf4d069e91f1fc8fd2f537b2f854cb`、dist manifest SHA `43a4f171f4f9b278cd5ea0d809922d2d658f2dbe50c938dcc98250c9bf8eb607`。原失败与分项续验全部归档。

新export-continue仅固定state05失败和历史主链/branches/race producer，升级同hash复用；旧成功阶段明确HISTORICAL_PRODUCER_ONLY，不改称当前新dist结果。exports-continuation不重播seed/发布/FINAL/评分，从新正式export请求继续，核全部accepted parents/children/facts/job前后hash不变及原FAILED batch/artifacts原样保留。随后新格式restore绑定原main-remaining生产者，不伪造main成功文件。目前该续验/restore未运行；shared-storage完整ON/OFF、revocation与四native完整矩阵仍待补充。主链实际为mixed storage（control=true、Scale共享未开启），不冒充全ON。

### Checkpoint 10：state06 三CSV成功，分析指标发现失败保留

7227dd6e 固定输入的 state06 复用原升级、原8个终态attempt与既有事实，仅新建三个真实Redis队列CSV导出。三者READY且下载校验通过，6/1/1行、548/63/26列；路径config/hash/termination/task satisfaction正确，未达native原始值/分数/时间为空且NOT_SHOWN。原FAILED batch不重置。随后Training source-list缺少预期Scale total，harness `assert.ok(metric)`失败，尚未POST analysis，未执行restore，也未到末尾accepted-fingerprint对照，不能把该末尾保护声称已通过。

原失败生产者保留：runtime SHA `c43577bb9acad245204ffae51c5af6e22560fc44492b9b242cd25f442ba51811`，分项result SHA `7befacb3128c86e7a48b7bedeccd601d0412974e628ef4fa8d9b00ccccb32669`，frozen-inputs SHA `aa6f11af170e2612bddb259fa63d5e13efda4708c0d461d96c83d2ceb31ccb9a`，exports producer `3e61b58c1eea47db5b200506ac1f6c5e03a1190ea7ce4e7799af722d43c25b59`。cleanup/source/priorSource/inputs四项全true，服务停止。checkpoint10归档仅公共结果、输入及前后字节manifest和安全失败log，不含私有配置、数据库、凭据或答案。

源码核实 source-list 当前读取definition.scores，而官方V2字典为definition.scoring.scores；产品修复另行冻结，须从精确冻结runtime的统一V1/V2 parser发现指标，保持teacher numeric disclosure，不能简单回退当前可编辑模板。新analysis-only continuation锁定state06，原三READY CSV只读下载比对旧SHA/bytes，原FAILED与READY行、8事实前后固定，仅补缺失analysis及其CSV。当前只是静态脚本，不授动态资格。

补充ON/OFF脚本已静态冻结：独立新14个FINAL（两模式各四工具，另两类撤权各A两次/B一次），每个attempt科学身份与封装hash分别绑定；四native真child非owner拒绝、未达无child/配额、Scale/SJT已达恢复与未达撤权拒绝。launcher尚未完成，未运行。独立progress窄审确认state/list和中间finalizer基于reached集合，无候选union分母泄漏，无需额外UI修改。

### Checkpoint 11：冻结runtime字典修复及定向检查

Scale source discovery不再读取可编辑definition.scores。按已授权课程/任务、有界已完成FINAL/UNIFIED child及最小parent headers，使用官方V1/V2/shared runtime parser；精确密文/引用按request去重，shared artifact一次IN批读，不读取result/answers/个人计分facts。每child仍核parent/epoch/slot/source/compiled hash和teacher numeric disclosure（ADMIN不升级audience），有效flow proof只核其快照密文摘要而不展开答案。相同item/key的所有冻结字典均校验，按既有comparability EXACT及label拒绝不可表达冲突，其他key并集；不新增selector/公共字段，当前无法细分选择冲突版本，既有NOT_COMPARABLE分析合同保持。

新37例通过，原相关discovery4例首轮2通过、2因旧SJT fixture遗漏flow markers而UNKNOWN失败；只局部补参数化两个fixture的真实null，受影响2例续验通过，未改生产failclosed。build10 tsc通过且输入前后一致，input SHA `e4f48388658551a0e937c93df61ce263a9fe2f1f21994a918449c219a5057da0`，dist manifest SHA `eb62e59d6e5b673f0c68d994feadd3000187aa19aac5c2710ecbc28a696c94d7`。原失败与全部producer保留在checkpoint11归档，不将重叠例相加。

新增Scale分支上限100任务、6000child/flow snapshot；一次child findMany（nested parent select的实际SQL可能多于1条）、shared slot及runtime artifact各至多一批、flow snapshots至多一批。mock调用数不冒充真实SQL/吞吐。另确认既有SJT discovery在新flow下每row未批传snapshot导致实际N+1，须在C19收口前局部合并本请求批量scope读取，不能仅推给C26。该后续修复尚未纳入当前构建/资格；state07也未运行。ON/OFF launcher现已静态WIP，五个prior SHA必填，未创建clone或服务。
