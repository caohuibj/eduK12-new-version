# Training 独立认知群体来源：定向原件

基线 `9f135a2ce45f0223d39b48ea8797310a81a63970`。仅本轮新增来源接线，未运行旧 81 / 175 / 41 个业务观察、全平台 PG 或浏览器；不含生产数据、凭据、原始作答或部署证明。

实际通过 **4 个不同应用 case**：

- `unit-current.json`：2 个纯适配 case，最新完成先选／未完成不覆盖／缺失不回退／零保留／专业报告可见值；协议／Profile／单位不混合。`unit-repair.json` 是这两 case 的较早成功原件，不重复计数。
- `postgres-first.json`：1 个真实 N=5 独立认知任务，通过原创建／发布／测量发布／正式提交服务生成结果。现有课程与五名合成参与者复用，未重放旧 Bundle。`goMedianRtMs` 有效 N=5、300ms、SD=0；`commissionRate` 均值 0。生成→存储→读取相同；未完成重做不改变旧版；专业报告解密 spy 表明读取只读 1 次 assignment 合同，没有 session 结果解密；学生读取被拒绝。
- `postgres-archive.json`：只选新增归档 case，1 通过／1 过滤。保留同一个原件，将任务经原归档服务归档；目录仍列原任务／版本，工具选择不再提供生成，旧版相等。没有重复五人作答或生成过程。

原五人执行后，生产代码仅增加归档状态的目录／只读可达处理（PUBLISHED 时的生成、选中结果和统计路径未变）；新增第二个 PG case 后只执行归档 case。原五人执行前未另录完整源码清单，不将后记清单伪装为执行时签名。当前后端编译精确绑定最终后端 tree；case 的原 reporter、范围与后续差异留供独立 review。

`backend-types.json`：Node v24.21.0，实际 `node node_modules/typescript/bin/tsc --noEmit` 退出 0，3968 份输入前后未变，后端 tree `3981ae7a7afa5716834f69315b708075b93c6c76`。完整执行时 before / after 输入清单保存在无损 `backend-types-original.json.gz`，简表含原件 SHA256 和空日志 SHA256；原件未签名。没有 frontend 修改／重复编译。

`draft-control-repair.log`：现有 Draft route 的 1 个新增定向 case 通过；仅 scope checkpoint，不是 Ready 资格或应用测试接纳，不可用于合并。首错 `draft-control-first.log` 是新测试错误断言不存在的 `backend` 输出键（应核对实际 `application_route` 和 requiredChecks），修正测试后同一 case 通过；生产门禁没有降低。

`unit-first.json` 为原首错，缺少夹具必填 `report` 配置，0 case 执行；修正为实际冻结配置后 2 case 通过。所有首错原件保留，不把它们改写为成功。只记录本地失败；本轮尚未启动正式 CI。

后续正式资格需按既有 route 绑定具体 PR / source / tree，经独立 review 后运行缺失项；这里不声称已正式接纳、CodeQL 成功、已合并或已部署。原 schema／迁移、依赖、前端／打印页面和 Composite START 均未改。Teacher GROUP 可见范围、缺失课程归属的历史 Scale / SJT 均未放宽，方案见来源矩阵。
