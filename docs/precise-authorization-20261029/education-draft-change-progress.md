# T2 显式草稿绑定变化审计

基于 `523cc301b` 检查点，在原私有教育问卷更新事务中补充记录，不改 Bundle 引擎、发布器、START、权限、报告定义或旧冻结内容。School/Teacher 复用同一服务；本阶段实际 DB 场景为 Teacher，School 独立端到端仍待收口。

保留原规则：同一 blockId 不能偷偷更换、删除其 selectedBinding 或替换来源。创建者只有显式删除旧 slot 并加入新授权 slot 才能更换；新 use 仍按当前学校/入口/作者资格、原 source 和 grant/revision/hash 校验。

新增纯变化投影只读取每个 slot 的 blockId、标准来源 ID/hash 和轻量 selectedBinding，不复制题本、报告正文或作答。普通说明文字编辑、重新排序以及无精确证据的 legacy 不制造替换事实；提供的损坏 pointer 拒绝。初次加入、显式移除和替换分别保留 added/removed，规模仍受原问卷和最多 50 个精确记录限制。

更新、附件同步和所有原校验成功后，同事务追加 `EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED`。记录实际 owner/entry/school、前后 draft revision/contentHash、removed/added 及 canonical changeHash。并发/旧 expectedRevision 失败不另留成功事件；事务失败不会留下更换或审计。该事件不授予权限，不为 legacy 回填当前默认 R。

实际结果：新增纯单测 3 PASS/原 5 filtered；独立保留 fixture 新增 DB 3 PASS，证明隐藏替换失败、明确新 slot 替换可冻结、原 frozen version 不变、旧 revision 重试无重复事件、普通文字编辑无新绑定事件、初次合法 slot 有事件、错误 hash 无草稿/审计写入，以及全部原 grant 逐字段不变。最终后端/fixture 闭包类型退出 0。没有为这个范围重放旧评分、内容或完整 participant 流程。

首轮 DB 3 FAIL：新审计遗漏 canonicalHash 导入，首事务回滚、后两项按依赖停止；回读仍为 9 grants/3 drafts/2 versions/0 new events，等待草稿 revision2，随后才重试。首轮类型还发现新单测内联对象的 excess-property 写法，改为同值变量；3 个已通过纯单测不重跑。原失败和成功分别保留，未将旧 invocation 改记为成功。

本次不是整个量表四入口或可信迁移 dry-run 的完成证明。School 新审计实际路径、Training 消费者业务选项/绑定、Survey/Training 修订替换、代表性能、编译浏览器与四入口 participant 验收、正式 CI 仍待执行。没有数据库迁移、旧记录回填、生产写入或 fun 注册。
