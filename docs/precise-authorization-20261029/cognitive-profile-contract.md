# 认知精确 profile 的接入边界

基于 `777730eac` 开始；此文描述正在实现的接口，不是四入口已完成证明。
Task2 已合入的 Bundle profile 是另外的理论模型，不改其引擎或 PR392 控制。

1. 同一 `testType/configId/configVersion` 下的 experience/research 是配置 profile，
   不创建新 testType。T1 用现有 `freezeAssignmentProfile` 解析合法 profile，
   保留 resolved config、完整指标/质量/报告/展示定义、既有 protocol 与随机算法版本。
   精确身份复用 `selected-configuration.ts` 的 COGNITIVE_PROFILE 分支。
2. 无个人数据的闭包放入现有不可变 `assessment_public_templates`，新增明确的
   `COGNITIVE_PROFILE_CONFIGURATION` kind，沿用 hash/加密/有限缓存和原不可变触发器。
   只扩展 kind 白名单，不新增表、权限中心、认知引擎或共享随机种子。
   新 SQL migration 只扩展该 CHECK；旧库不硬写新 kind，需在新独立库走正常迁移。
3. 内容 artifact 不含 issuer/recipient、授权状态/有效期、attempt/seed。
   每个入口仍用自己的 grant/audit 保存不可变授权修订及轻量 artifactHash，
   不将共享内容 cache 当权限 cache。两个接收者可以引用同一闭包，各自 binding 不同。
4. T2 从原 T1 artifact 复制现有 assignment/config/report 冻结字段，
   草稿保存 selectedBinding/artifactHash。发布校验当前原授权及完整性，不查 latest
   重合并同名 profile。T3 继续每次 attempt 的随机 seed、epoch、恢复和已有 admission。
   新 profile 的 protocol/presentation 需从冻结闭包送入现有 runtime；不改变刺激或布局。
5. Training 新精确使用权复用 ContentCapabilityGrant/入口管理员和原管理事件，
   不镜像 MaterialGrant；旧 resourceId-only MaterialGrant 保留原语义。
   Survey 沿用其 exact source grant，
   School/Teacher 沿用组织范围和精确分发委托；系统审批不替代分发。
   新 typed grant 不走 ADMIN blanket bypass；legacy OPEN/旧 grant 显式保留原政策。
6. Survey 当前普通认知目录适配只接受固定 gonogo identity/config，不能把任意 native
   config 改名塞入该协议。后续复用已有 runtime 并做最薄显式 adapter；未接通的入口
   显示未就绪，不伪装成已支持。11 个 DRAFT 候选也不能成为 main 原生可执行工具。

第一切片只建立无个人数据的精确内容闭包/存储/完整性检查及直接测试。
它不授予权限、不暴露新管理 endpoint，不改变现有 assignment/START/报告行为。
量表 source 与前端输入未变，其原证据仍保留；新 kind、migration 和新 profile 闭包需新证据。

Training 切片公共适配（2026-10-30）：`FrozenAssignmentCopy` 新增可选
`selectedCognitiveProfile` 轻量指针；prepare helper 返回可选 frozenProfile；
`publishAssignmentMeasurementRelease` 可选第四个 artifact 参数，旧调用保持既有路径。
新 typed assignment 的 courseSnapshot 保存指针与业务配置名称；问卷和流候选复制不得丢弃。
这些只是薄边界适配，不替换 Task2 Bundle 模型/引擎。v2 artifact 新增既有编译输出、
媒体展示与 reference 定义；v1 历史继续可读，新使用必须明确升级审批。
