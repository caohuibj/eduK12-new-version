# 第二批接续：剩余配置、报告结构与呈现

接手 head：`e4b1ba0c7cf9fa520e046571c8c68fc4fdf6ce23`。重新 fetch 后 main 仍为
`642fda7ab754790686d6626efac62b73a332e663`；工作区原先干净。沿用仓库规则；未发现
仓库附带 `.agents/skills`。本轮用户已授权继续完成剩余工作，未授权本节点 CI、
Ready、merge、部署或正式业务发布。

## 空间角度的显示结构修复

空间精度 scorer 的四个角度指标原本就是 `{value, unit:'deg'}`；它们是公开的
自然单位值，不是科研统计地图。原通用格式会显示成 `value-back / unit-back`。
现有 `metricFormats` 增加显式 quantity 格式，只接受有限数值＋精确 deg 单位且
无额外字段，输出角度；没有 opt-in 的旧冻结呈现保留原行为。

仅将空间呈现版本从 0.1.0 更新为 0.1.1；不改测量、计分、原始值、原报告版本或
旧冻结数据。`reportBinding`、原始地图/数组仍然不进入公开指标。新定向断言实际
通过（零、null、错单位、额外字段、invalid 和历史无格式版本），见
[evidence/spatial-quantity.json](evidence/spatial-quantity.json)。

本轮起初只读 readiness 探查重复消费了六包先前已合格的结构输入，这是多余执行；
如实保留这次探查身份，不将它作为新增开发或新计分证据。后续不重跑其六包检查。

其他配置与呈现工作的最终执行证据、原失败和续验在同目录逐项保留。

## 九项现有配置注册与隔离安装

注意瞬脱、气球努力、双箭头、gradCPT、心与花、Horizon、空间精度、视觉搜索加入
既有 native definition 与 presentation factory 集合；ANT 使用已存在的 1.1.0
教学定义。配置全由现有协议工厂取得，一个 config 身份加双profile。MOT/点数判断
原配置 JSON 不变；工厂返回 plain-object config，解决先前 interface 缺索引签名
导致的 TypeScript 不兼容，不用不安全断言绕过编译。

[精确选择文件](selected-nine.json) 可供现有 CLI 使用。原旧版 ANT/Enumeration
仍在，未注册近似版本回退；连续图像再认没有拿合成图片填入正式池，因此不造 seed。
新注册本身**不扩大** `assertNativeDeliverySupported` 或 raw-archive 的入口范围。
九项仍是产品运行器/原件适配待接的 DRAFT，不声称已可四入口作答或公共发布。

新建 tmpfs PostgreSQL 实际 preview 零写、创建九个 DRAFT/GRANT、无发布指针/投放。
原数据库断言在核对完整 seed 时发现 ANT 带出了多余身份元数据，失败原件保留为
[installation-original.json](evidence/installation-original.json)。已收窄工厂只返回
安装所需字段；这不改变数据库已写的核心配置，未重复 preview/create，直接从原
数据库失败位置续查核心字段与幂等，九行不变、九条审计、零assignment和release
pointer，见 [installation-continued.json](evidence/installation-continued.json) 与
[可读续验程序](evidence/continue-install.cjs)。

注册两项新用例首轮 1PASS/1FAIL：失败来自过宽的“所有 object 都是科研地图”假设，
空间公开角度 wrapper 不属于科研地图。修正为显式 quantity 白名单，并验证其他
地图/数组仍私有；只续验失败用例。原始及续验分别为
[registration-original.json](evidence/registration-original.json)、
[registration-freeze.json](evidence/registration-freeze.json)。旧两工具测试仅收窄其
选择集到原批次两项，未降低原断言或重跑已合格流程。

直接后端类型首轮发现 plain-object config 的三处 interface 兼容错误，已定向修正，
保留原诊断；最终 [backend-direct-types.json](evidence/backend-direct-types.json)
零诊断。没有全量 seed、全平台 CI、全库计分、权限或 schema 修改。
