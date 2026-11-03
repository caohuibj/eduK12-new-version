# 本候选检查范围

目标：MI Student Voice 2026–27，基线 `adad907a4b68606ce71bb1a4f2d7c511c872c715`。
精确验证提交见 validation.json 的 checkedSourceCommit；最终PR head/tree由GitHub回读提供。

修改：四个只含元数据的source.json及现有TS包装、生成索引、同母工具交付文档。
消费者：现有来源目录。没有executable、scorer、表单定义、授予权限、接收者策略或安装/发布修改。
原有258版本不改，只有生成索引按现有生成器排序移位。

必要检查：新增来源AST/schema/validator及CATALOG_ONLY边界；静态普通组合依赖；
生成索引check；投影无执行包且现有runtime-policy编译器拒绝目录源；完整Git差异轻量路由。
执行位置为本云端Node24.21.0及现有锁依赖。预计2分钟内完成，不运行PG/Redis/浏览器/应用构建。
来源许可不靠schema判定；无真实FORM内容就不做隔离库占位导入。

已读取AGENTS及release规范；已读取Notion CI常见错误页（2026-11-01编辑版）。
Hui连接404保留，Qiang现有连接读到同一指定页面；未修改Notion。
相关CI-007：生成索引与实际来源一致；CI-020：精确base/head及验证输入，原通过不泛化。
CI-001/003/006：本候选不运行DB、前端编译或真实身份流程，N_A，不将其当PASS。

现有路线预期content / scale_intake_light；所选官方任务为scope、assessment content / scale-intake及稳定汇总；
Ready时保留原CodeQL规则。本次不新设检查器、不拓宽CI白名单、不运行全平台。
本地合格证据不等于GitHub正式门禁。

Notion页要求“dot独立复核后决定是否触发”。本线程完成精确候选和本地证据后，
以 [skip ci] Draft PR交付给主线作这项复核；正式CI暂不激活、run留空。
这不是需要用户再次确认的业务问题；主线根据既有授权安排现有轻量路线即可。
不Ready、不合并、不部署、不写生产库。所有未运行项保持NOT_RUN，不声称门禁通过。
