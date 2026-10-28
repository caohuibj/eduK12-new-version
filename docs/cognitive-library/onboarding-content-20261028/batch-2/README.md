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
