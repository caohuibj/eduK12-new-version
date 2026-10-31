# 新独立 Scale 群报读取器：原始验证记录

父候选 #423：`a52af7a4a7aee6e6e1d06c862104e224a59e1524`。没有重试 #422 被拒绝的绑定上传；没有改 #422 / #423 候选、启动归属、Teacher 权限、School 目录、schema 或前端。

实际通过 **两个不同应用 case**，各执行一次：

- `unit-first.json`：已有官方构造器生成合成冻结 runtime / 正式 score，验证 zero / missing / 负分／真实量尺、C 变化拒绝、已有 versionAxes 下仅修改 R 文字仍为相同原始测量。不是另写评分或均值公式测试。
- `postgres-first.json`：真实课程独立 Scale N=5 生成→Artifact→读取。复用 #423 已完成的一名，**只新增四名必要合成参与者与正式完成**；values `[0,1,0,1,0]`，均值0.4、样本SD√0.3、有效N5、官方range0..1。旧 unscoped 作答未改写或纳入；当前新建成员关系移除后旧快照一致；另一课程读不到该 Artifact；公开 projection 无参与者ID。读取的 Scale facts reader 和 frozen runtime reader 调用均0。

随后只优化**工具选择**的查询：原 picker 无须读取结果／fact 摘要，现去掉该 join 和相关摘要计算；生成与旧版读取仍走原相同指针查询。`picker-current.ts` 是实际只读续验原脚本，`picker-current-proof.json` / `.log` 记录保留任务仍返回一个合法工具，没有重答、重新生成或重新聚合。此续验不是第三个 application case，也不是生产压测。

`initial-backend-types.json` 保留 picker 优化前的成功编译（tree `e635e470a9eaa6cd1d3b05dca39f6bf2ce0c68c3`）。当前 `backend-types.json` 是实际 SQL 接线改变后的后端编译：Node v24.21.0、`tsc --noEmit` 退出0、3972份输入前后未变、精确 backend tree `e0a3e714a149e71b30ff46e76cc216ffb60b6d02`。不是因同一提交机械重复，两个应用 case／五人流程没有重跑；前端仍为 #423 tree `a71efa7f3163f4240e1eb1090bec410c8fb375a5`，未再次编译或跑浏览器。

所有记录为 unsigned 本地原件，源码关联是观察到未变代码的事后关联，不冒充执行时 Git 签名；两次 compiler receipt 的组件树及输入稳定性是各自实际采集。原始记者输出保留，不合并／重写为一次虚假的全绿测试。未运行 #422 四项、#423 三项或旧81／175／41项，也未新增全平台数据库恢复、计分全集或防御矩阵。

本切片未执行正式 CI、未合并、未部署。子分支的 Teacher 文档仅修订方案：库 Scale 在首批，同一新 GROUP 合同保留原已批准本人摘要；School 文案收窄为当前3类数值叶及班级／标签，未扩大功能。
