# 教育草稿与全过程原授权指针

本增量在已有 STANDARD 来源字段中保存 `selectedBinding` 轻量指针：bindingHash、configurationHash、原授权 ID/revision。只有标准量表可携带该字段；损坏、伪造或跨来源输入拒绝。新发行服务仍未挂路由，管理员目录/UI 未完成。

草稿的工具块第一次选择配置时保存指针；保留同一个 blockId 的编辑不能删除、改指针或改来源，显式替换需另建块。保存由服务器检查原精确授权和当前依据，不接受任意 hash 作为证明。不同不可变版本可以绑定同来源的不同授权；批量发布检查全部原修订，不以某条当前可用授权代替其他版本。

冻结继续复用现有 private-tool version 和数据库 seal。指针位于原不可变 version.definition，已有 contentHash 囊括它；执行 unit 和严格 manifest 映射不增加授权字段，也不改变数据库封存守卫或 Bundle 引擎。发布前 NEW_USE 从该原版本批量投影轻量指针；新 START 从冻结 origin 指向的同一版本读回，检查其精确 use/原 manager/委托/入口批准，不查 latest。新 typed 授权不能供省略指针的 legacy 草稿使用；独立合法旧 grant 仍保持原政策。BOUND_COLLECTION、原 attempt seed/epoch、紧急停止和报告 ACL 不变，历史内容读取不依赖 live use 存活。

实际本地证据见相邻 verification.json：65 个受影响单测、4 个 Teacher HTTP/封存/NEW_USE PostgreSQL 场景、3 个后续只读边界场景、1 个既有 School legacy 全过程通过；受影响后端及测试闭包类型检查退出 0。Teacher 四场景证明新授权不能替代旧版本、撤销后旧固定版本仍可读；它们没有模拟或宣称完成真实 Run 发布/START/报告。原 School legacy 场景则实际运行原用户链路，验证新的 SQL 原版本 JOIN 与旧封存兼容。

保留初始错误：HTTP fixture 用错认证传输导致 401，后续独立分支写入过第二授权/封存版本，已回读并保留原库，另建已知 v2 起点；初次 scoped tsc 缺 Express augmentation 根并发现单测额外字段类型；首次 School 全过程缺合成 Campus HMAC key，失败在草稿前，原库保留，另建 v2 补齐环境。没有放宽认证、断言、权限或 DB guard。未重复 DOT 评分/报告对照，未启动全平台 CI 或生产操作。

尚缺两个教育入口新 typed 授权任务全过程、管理员合法选项/发行/撤权 UI、目录对当前 typed 依据和配置业务名称的批量解析、旧数据 dry-run 与性能基线。Survey、认知精确授权另待实现；本增量不能作为四入口完成证明。

## 后续两个教育入口精确授权用户链路

在另一个明确隔离的来源克隆库，复用已批准的生物学科学业自我概念原件，经现有正式学校/教师工作流 fixture 建立合法使用者；系统给独立正式入口 manager 精确学校/source 的分发委托，manager 再发行绑定。每个入口实际创建并封存两个独立版本，挂入真实 Run、发布、START 一个版本、撤销原 use：已开始版本按原 attempt 续答，新 START 被拒；原版本完成真实背景表单及量表提交、报告读取。没有合成 FINAL 或直接 SQL 填执行/结果。

原始命令为 School 1 PASS、Teacher 1 FAIL；Teacher 已真实完成交卷，失败仅在报告整体状态预期。原件受众是学生，Teacher 正确返回 COMPLETION_ONLY，单元 WITHHELD；测试原先误写整体 READY。未修改报告权限或原件，已修正预期，另以纯读取补验完成状态、冻结授权、撤权、等待任务零作答及正确受众；1 PASS。原失败完整保留，没有重新 START/交卷，也不将原整条命令改称全绿。School 报告 READY。Teacher 成人报告素材的对应正例仍需后续实际合法来源，不用学生报告扩权填补。

类型检查还补齐新 School 调用者的真实 principal 字段；共享 runtime fixture 的原目标策略只加字面量类型标注，emitted JS 完全相同；单独测试闭包使用 Node24.21 支持的 ES2021 lib 以覆盖原 fixture 的 replaceAll，生产 tsconfig 未改。纯读取补验最初触发 5 秒测试预算，详细日志确定为导入/执行超时；将这一新只读场景设为 30 秒后实际约 7 秒通过。所有错误和原始结果见 `education-selected-lifecycle-verification.json`。这些证据补齐服务/API 的正常任务链路，仍未完成教育管理员目录/UI、性能、旧数据 dry-run 或正式 CI。
