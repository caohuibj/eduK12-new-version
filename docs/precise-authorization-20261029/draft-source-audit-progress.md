# Training / Survey 草稿精确来源审计

基线 `c21bccf7bb278161f76b49141b8489abd9487358`；main 对齐记录仍为
`e65d87222d351e5dfde52e389f3aa403380443eb`。本阶段只补 T2 草稿来源变化和
Training 复制身份，不修改素材、schema、权限中心、评分/报告/认知引擎或 CI。

Training 在现有条目添加/删除事务内写入
`TRAINING_DRAFT_SOURCE_BINDINGS_CHANGED`，保留实际操作者、容器所有者、前后修订、
slot、组合/hash、原 referenceHash 和轻量 selectedBinding。普通文字编辑、排序和
没有精确 pin 的 legacy 条目不伪造更换记录；既有修订/所有权检查不变。

Survey 在原 `WAVE_DRAFT_CREATED/UPDATED` 事件中附加 `selectedSourceChanges`。
工具集合变化时，一次有界查询读取旧/新 grant 的原身份头，不加载完整题本、报告或
当前 registry。排序/文字编辑不做这次查询。旧 grant 已普通撤销仍能被显式移出草稿；
新导入、发布和 START 继续各自核当前授权。历史身份读取不被当作使用权。

自审发现 Training copy 原先只把组合交给解析器，可能用当前 grant 修订代替旧 pin。
现在复制传递原 selectedBinding，已失效的原修订明确拒绝；有效复制使用新容器/slot
和 referenceHash，但保留原授权/配置身份。新复制记录
`TRAINING_DRAFT_SOURCE_BINDINGS_COPIED`，包含原容器/修订及新增绑定；原请求恢复
仍返回同一副本且不重复记账。legacy 无 pin 继续原路径，不回填当前默认为历史证据。

本云节点验证：

- 新增纯审计/跨类型约束单测 3 条通过。
- `precise_training_t2_audit_test_20261029` 从已保留 replacement 库独立克隆：
  2 条真实 PostgreSQL / 9 次受保护 HTTP 请求通过。原 revision 5 条目被明确移除，
  添加当前 revision 7；跨作者/过期修订失败，文字/排序不新增来源事件；并发删除
  仅一次成功及一次 409。其余 11 个任务、4 个 grant 和原来源完整相同。
- `precise_survey_t2_audit_test_20261029` 独立克隆：2 条实际项目/导入/测量发布/
  波次服务用例通过。移除原已撤销 grant、选择新精确 grant，变化身份头查询 1 次，
  普通编辑/排序 0 次；创建恢复不重复记账，并发一次成功/一次冲突。
  原 9 个 grant、5 份冻结 publication 和源组合未改变。新增一个工具草稿和一个波次。
- Training copy 补充 2 条 PostgreSQL 服务用例通过：同组合当前 grant 已到 7，
  旧 pin 5 复制仍拒绝；有效 pin 7 的副本及原请求恢复只产生一份任务/一个事件。
  最终该克隆为 13 个任务、4 条条目变化事件、1 条复制事件；原 12 个任务保留。
- 最终受影响后端闭包类型检查在 Node 24.21.0 退出 0；没有前端变化。

保留首错：复制补充首轮两条失败，第一条把既有授权拒绝 403 误写成 409，第二条
因前置失败主动停止。先只读回查 `12|0|4|4`（任务/复制事件/条目变化事件/grant），
确认未写入副本再修断言并执行这两条。第一次官方 Node 类型检查发现新增 copy
审计调用把 Prisma 可空 createdBy 传给非空上下文；改用刚创建时的实际 actorId，
之后类型检查成功。更早一次 host Node 24.19.0 类型检查虽退出 0，但低于仓库
engine，不作合格类型证据。所有原退出码与 reporter 均保留。

证据见 [verification](draft-source-audit-verification.json) 和
[原始记录](draft-source-audit-raw.json)。原先已通过的添加/删除和 Survey 正常路径
没有因后续独立 copy 补充或存储异常提示修改而整套重放；上述各记录标明其实际
执行范围。源码 hash 清单是执行后补录的最终文件清单，不是历史完整 node_modules
证明、签名证据或正式 CI 复用批准。

边界：仅 localhost PostgreSQL 16.15 owner 角色；没有生产、真实账号授权、参与者
交卷/报告重跑、Survey 受保护 HTTP/浏览器或性能分位数验收。历史已发布定义不
查当前模板，也未迁移/伪造 legacy pin。任意新 C/P/R 组合审批、量表剩余全过程、
认知四入口及有界正式 CI/PR 仍未完成，不能据本阶段宣称任务 1 完成或已合入 main。
