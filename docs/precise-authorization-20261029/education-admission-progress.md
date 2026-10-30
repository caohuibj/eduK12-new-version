# 教育入口批准范围：开发检查点

在 Training 增量 `17d19b36eca2e0b15a94709c5b5eb805d8729a04` 之后，补齐精确 STANDARD 组合的 School/Teacher **系统批准范围表达**。这项不产生接收者使用权，也不意味着教育入口管理员分发闭环或四入口验收已完成。

- 系统标准组合审批页面可明确选择 Training、Survey、School、Teacher。请求仍要求近期管理员双因素校验，保存完整原审批意图，真实试运行通过才成为 ONLINE。
- 教育范围只允许 `standard-release:<UUID>` 的精确组合。其他原生/自编工具的现有批准函数和默认 UI 保持 Training/Survey 两入口；数据库约束也拒绝教育入口的其他 resourceKey。
- 已批准组合不能靠重放审批或新 requestId 改变入口范围。原批准意图、旧 use grant 和历史任务不回填、不扩权、不撤销。
- 复用既有 tool policy 表和 standard release；新增迁移只调整范围约束，不增加平行授权体系。

验证在已有 GENERAL 专用测试库中先只读检查四个合成演员和唯一原组合，保留原链路结果，再应用本次正式迁移。使用已存在的 registered `REPORT=none-v1` 形成一个新组合，通过真实审批和三例 trial 批准四入口；没有生成新量表题本或新报告内容。

实际通过：后端 5 项（2 个结构/负例单测、3 个 PostgreSQL/HTTP 场景），界面 21 项，后端依赖闭包类型检查、前端受影响组件与消费者类型检查、改动文件 lint。前端初次受限类型检查缺少现有 test/setup.ts 的断言类型，补入真实测试 setup 后通过，未改应用或测试业务逻辑来回避错误。

本次正常审批期间 content capability use grant 数量保持不变。旧 Training 组合仍只有 TRAINING policy；新四入口组合的四条 policy、三条真实 trial 和请求回读都已验证。源代码与报告 hash 见 `education-admission-verification.json`。

继续事项：平台 manager 的正式入口资格与精确分发委托、合法学校/产品接收者目录及 selfGrant 双资格、不可变授权修订/草稿 binding 消费、旧 root-use 兼容和逐入口撤权边界。后续新路径必须完成这些检查后才允许教育使用，不能因本次批准范围可表达就硬写授权。尚未执行浏览器端到端、性能对照或正式 GitHub CI；没有生产操作。
