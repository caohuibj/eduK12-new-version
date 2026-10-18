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
