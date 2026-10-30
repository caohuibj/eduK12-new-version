# School / Teacher 精确认知接入契约（实施中）

从 `254c5504156d09ce8146e9f83dc39db35b53add3` 继续，尚未验收完成。

复用既有 `ContentCapabilityGrant`、教育平台管理角色、学校产品资格和精确原生 M
分发委托。系统给 manager 的 `material.distribute` 明确绑定学校、产品和不可变
measurement release；入口批准再限定 profile artifact。管理员的使用修订只授予
该 artifact 的 `material.use`，不因 OPEN、ADMIN 或知道 hash 获得使用权。
这与 STANDARD 组合按精确 M 委托、再选已批准报告的既有链路一致，不扩权到其他 M。

- T1 输入：configId、profile、artifactHash、接收者、学校/产品、原委托 ID/版本、
  有效期、业务名称、requestId，以及可选的原修订/替换原因。发行者来自当前会话。
- 使用资源键：`education-source:COGNITIVE_PROFILE:<configId>:<artifactHash>`。
  复用历史教育配置审计 action；sealed binding 的 `configuration.kind` 明确为
  `COGNITIVE_PROFILE`，metadata 另保留 artifactHash。旧 action 名不改写历史。
- 编辑器 source：仍是 `COGNITIVE_CONFIG`、原 configId 和全局 M contentHash，
  新精确来源同时包含 artifactHash / selectedBinding，profile 由管理员授权确定。
  缺任一字段拒绝。旧无 pin 来源保持原 MaterialGrant/OPEN 和用户选 profile 路径。
- T2：原 immutable artifact 装入现有 assignment freeze 字段，私人 M 从冻结全局 M
  投影；新增内部 `selectedEducationCognitiveProfile` 只作冻结身份，不是权限证明。
  正式父任务仍由原教育 composition / run 资格与 SOURCE use 校验授权。
- T3：复用原统一 cognitive snapshot / 每 attempt seed。Task 1 只增加冻结输入适配，
  不修改 Bundle 编排、计分或报告引擎。历史读取不查询当前 grant 或重选同名 profile。
- 目录按页批量读当前原委托和入口批准。认知 artifact 的解密在明确预览/T1/T2，
  不为每卡重新做专业兼容性检查。技术 hash 收入详情，使用者不再选 profile。

仍需：正常管理 API / 页面、独立库 School/Teacher 实际冻结及正式 START/FINAL、
撤权与历史验证、受影响旧路径检查。现有 Survey / Training 证据不替代这些验收。
