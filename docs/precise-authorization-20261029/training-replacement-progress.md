# Training 显式替换与两个独立修订

基于 `9b8731e8a89450f0fa04c83d5005ac7bfcbe5e73`，远端 main 再核仍为 `e65d87222d351e5dfde52e389f3aa403380443eb`。沿用[可选输入/输出契约](training-replacement-contract.md)，复用原 MaterialGrant、管理事件、入口资格与精确委托；没有新表、引擎或 seed。

管理员明确替换时，`replaces` 固定旧组合的 use ID/版本/原因；`expectedUseId/expectedUseVersion` 另固定曾撤销的新目标组合 use。两个版本不能混用。仅同一工具、同一培训师、原发行者的可信旧 typed use 可替换。新目标已有活动授权时拒绝覆盖；同组合改名继续走原明确撤销/再发行。legacy 缺原 T1 不自动升级，原定义不从默认 R 回填。

原发行事务按请求、接收者/工具和目标组合串行，再锁旧 use；新来源和当前发行/接收权限完整核查，旧来源以 HISTORY 核原身份及 hash。发行目标新修订、保存 supersedes、普通撤销旧 use并版本推进、记录前后指针/原因在同一事务完成。新绑定缺失或 CAS 失败整个事务回滚。幂等 hash 包含完整替换意图；原请求重放先核原回执，不依赖旧 use 此刻是否又有后续修订，不复活已撤结果。旧 T1 事件和已引用定义不覆盖。

管理读取增加小型原 selectedBinding 指针：原事件入口/接收者/发行者/授权 ID、原修订及原依据结构必须一致；最多2条 distinct 证据，冲突/损坏不变成新 typed。只返回轻量指针，内部 evidence/委托字段不出响应，不解密或编译报告。这是身份提示，不是当前来源可用性或新授权证明；完整来源和机械条件仍在发行事务核查。实际两个 header GET 共16条既有认证/资格/目录 SQL，其中目标读取2条，没有 measurement 内容读取；不是代表性能预算结果。

管理页面从原具名配置进入明确替换，选择同工具另一份已批准配置，保留原培训师及旧修订，填写原因，并明确提示旧草稿不自动换版。原接收者退出当前合格名单时拒绝，不能临时换人。目标如有旧授权须读取其真实修订，活动目标不能覆盖。未知结果保留新旧两对 ID/版本、原因和原 requestId，无密码/报告体；完整 request 和 supersedes 均相等才结束恢复，错误原因不能当作成功。取消或更新旧修订必须明确重读，不能自动 latest。原普通发行/撤销/账号隔离/旧未知请求仍兼容。

独立克隆库 `precise_training_replacement_test_20261029` 的5个 PG/HTTP组合场景分别通过：

- 新目标原 use 明确从3撤到4，实际 GENERAL、COURSE 发布及独立 waiting draft 保留旧 Full use5。匿名真实入场、年级表单提交到 SCALE，冻结原报告。
- 错接收者、错旧修订、注入 pointer、替代新目标 ID 均拒绝且两个 use不变。
- 原子发行目标 None use5，旧 Full use5撤到6；旧 waiting发布/新匿名 START403，已进入 SCALE 的 attempt 仍能恢复，binding逐字段相同。GENERAL/COURSE旧发布和旧T1相等。新任务实际匿名 START冻结None R，原生 Scale默认报告未覆盖。
- 竞争回到 Full：只1成功/1个409，Full use7、None use6；历史原请求仍返回其 None use5、current6/revoked，保留原supersedes。仅4条 MaterialGrant，原8个模板任务与来源保持不变。
- 新读取和资格阶段单独执行：精确当前/已撤原指针正确、无报告体读取；无入口身份发行403且未补角色。随后用既有独立系统管理服务显式建立合成 Teacher 的入口资格（非发行自动修复），仍不能替换另一发行者409。只有入口资格的 Student 自授403且角色不变；合格 Teacher＋入口管理身份显式自用成功、selfGrant=true，发行期间用户/入口记录不变。活动目标/同组合替换被拒。该新 use在业务身份下没有取得他人报告403；不改既有管理身份报告政策。

前端28 PASS：API旧4/新3、页面旧17/新4，覆盖两个修订、原原因/hash回读、失资格不换人、另一发行者不接管、response loss、旧普通未知恢复和当前账号隔离。最终后端闭包类型、前端类型和改动 lint退出0。后续资格阶段显式 SQL观测开关只为读取查询计数，不将其视作原参与者场景完全相同的执行条件。

首轮0 PASS/4 FAIL如实保留：生成链接“当前＋1小时”略晚于任务自身截止，服务器400；其余3项依赖停止。只读回读确认4 grants、旧目标已撤4、3个既有任务、0替换事件，再用任务保存的 expiresAt继续，复用这3个任务，不重建/回滚已完成写入。后续4 PASS；新增header/资格1 PASS，原4过滤。没有重复素材/试运行/计分/FINAL、DOT20对照或旧整条报告测试。HTTP/JWT proof均合成，不是真人 MFA。

实际库最终仍4 users/4 grants/12任务；为正反资格用例显式建立第二个合成入口 manager，旧和新测试库不涉及生产。最终Full owner7/None owner7，另一Teacher的Full3/None3，旧封存版本继续可读。该状态不是 main 或生产，也不代表所有入口已经验收。

仍待：Training/Survey明确 T2草稿变化审计、完整 COURSE participant/FINAL及四入口相应缺项、真实编译浏览器、代表性能/批量、runtime DB role、任意新跨轴组合审批、认知四入口、适用正式CI/Draft PR/合并。fun自动注册的特定阻碍仍保留；没有为本阶段取用被拒工程树或给真实用户授权。
