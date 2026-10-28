# 认知入库机制：结构与生命周期分开

基线 main `6203a829dc8d7de707e67f413acfa5a354a21e09`。独立 PR366，与量表 PR365、用户自行管理的认知内容开发分支分离。

## 本轮优化

1. 校验实际声明的 research / experience / standard，不再强迫只有科研/实用两版的工具捏造第三版。至少一个有效模式、每个模式的配置/FINAL预算和指标引用仍必须成立；未声明的模式不能被选择，也不自动发布 DRAFT。
2. 科研声明和证据不足仍原样留在诊断中，供人工审核；不再以 scientific.declarationValid 决定技术 CLI 退出码。技术/执行结构错误仍失败；不把声明不足改成“已验证”，不改变评分、报告或真实权限。
3. 新增选定配置安装预览与显式安装，复用既有静态 seeds、v2 定义和 product-readiness，不接收运行时代码/任意 JSON 工具。只处理明确选中的精确 testType/configVersion/engineVersion/scoringVersion。

## 操作方式

在 backend 工作目录使用现有 tsx：

```sh
node node_modules/tsx/dist/cli.mjs src/scripts/install-cognitive-configs.ts --input selected-configs.json --actor EXISTING_SYSTEM_ADMIN_ID
```

默认 PREVIEW，不写数据。相同命令额外加 `--apply` 才安装。输入只包含选择，不复制工具实现：

```json
{"schemaVersion":1,"items":[{"testType":"reaction","configVersion":"1.1.0","engineVersion":"1.0.0","scoringVersion":"1.1.0"}]}
```

此例已核对当前 reaction seed 的精确身份，只演示结构安装；它带旧模拟参考配置，不是推荐公开投放或真实常模认证。仍应根据目标工具的实际 seed 选择版本。

- 仅真实且有效的 SYSTEM_ADMIN 可以预览或安装。新建项总是 DRAFT / GRANT，源码 seed 标 PUBLISHED 也不自动升格；不发放资源授权。
- 相同身份、相同核心配置返回 ALREADY_PRESENT，保留原 DRAFT/PUBLISHED/RETIRED 生命周期及访问政策，不重新写审计。
- 同一身份不同内容返回 IMMUTABLE_CONFIG_CONFLICT，不覆盖；重复选择、未注册 seed 或执行版本不匹配分别报告。已知不合格项不阻止同次选择中其他合格项建立草稿。
- 一次 apply 的实际写入在 Serializable 事务中完成；数据库异常会回滚这次写入，不承诺忽略异常后仍部分成功。重复/并发写入仍由原唯一约束保护。
- hasBlocked 表示选择清单内仍有阻碍，CLI exit2 不等于所有条目未写入，应读取逐项 action。数据库异常 exit1，不冒称成功。
- 安装不是发布。后续仍用现有 `publish-cognitive-configs.ts`/发布服务和公共库/入口分配机制，不另造一套生命周期。

## 实际验证与边界

- 模式合同4项 PASS，包含两版支持、不虚构 standard、不自动发布和错误配置拒绝。
- 新科学备注/技术退出合同1项 PASS，旧项过滤；科研不被认可的诊断仍完整保留。
- 安装单元合同3项 PASS；隔离 PostgreSQL17实际1条安装旅程 PASS：预览零写入、一次安装、草稿/GRANT、未产生measurement release、幂等及单条审计、冲突保留、冻结管理员拒绝。
- 首次模式测试因日志目录路径错误在运行前失败，未计作通过。测试原件见 evidence，不伪造签名或 Actions 身份。PG全迁移仅用于新隔离夹具，不声称升级/恢复资格；无生产数据。
- 当前候选后端 TypeScript 检查实际 exit0，执行前候选tree、编译器/锁摘要和原日志见 evidence/install-types-receipt.json；这不是正式Actions资格。
- 这不是实际候选包已入库或平台上线。本地验收中的配置是合成数据库内的现有注册来源，仅证明安装机制。

## 下一步

优化后，逐项核固定 PR/分支中的认知包：已实现与未接入分开；后端/前端精确版本、配置种子、报告投影、教学/输入、必要原始记录与引用关系一致。只补具体缺项，不从头开发已有测验，不把一个案例失败扩大为全库重测。

当前 importer 只认识已经注册的 seed；native 候选未登记到相应来源时明确阻断，不能因为有 package.ts 就假称安装成功。实际公共库发布与四入口授权、用户所管内容任务、生产部署各自独立。
