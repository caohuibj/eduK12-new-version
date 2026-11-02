# 本工具候选与最小验证交接

基线由adad907a更新为`ae05ed2e70691bda817ab323130f9caf4dff26ca`，纳入主线#551/#556公共修复。两基线间本工具消费的schema、计分器、报告生成器、materialize、axis-snapshot和Prisma schema均未改变；checkSelectedSource函数也未改变，改的是静态bundle依赖解析及SJT读取工具。原私有计分/报告/隔离导入证据按其真实adad输入保留，未重跑；最新公共parser对本六项目录与真实依赖的检查在本批定向验证/正式CI执行。此前TSR旧失败run不重跑、不改写。

修改组件 → 六项catalog-only source及生成索引、来源/报告说明和脱敏证据。可能故障 → 同源重复、语言或角色混淆、版权题文误入公开Git、目录误启施测、丢失共同标签或拆分编号。主要位置 → 本地已执行私有原生scoring/report及隔离PG读回；正式CI仅运行公开目录的现有Scale内容轻路线和必要依赖，不重跑私有原型/PG，不构建无关应用。

本次使用Node24.19.0与既有锁定依赖的本地环境；不是官方Node24.21.0干净安装证明。精确base/head/tree、模式和完整diff在提交/PR描述冻结。测试采用合成答案和独立本地Docker PG16.15，真实参与者0，deployment policy0；容器和确切匿名卷均已回收。

已读取既有CI错误清单。适用CI-007（原生成器更新索引；check结果只认真实执行）、CI-020（来源版本、原验证边界、候选base/head/merge checkout及未跑项）、CI-004（不扩checker scope、不因目录候选启动平台全量）。#556已集中处理旧CHEXI输入解析；本分支不改工具/门禁。无本批正式CI失败历史；若新CI失败，保留原run/job/attempt、先归因，不盲目重复或换SHA清零。此前Notion写回被自动审批拒绝，未获该共享页新写入授权时不重试；主线保留该维护责任。

所选路线预期：content / domains=[scale] / scale_intake_light=true。主CI scope → assessment content / scale-intake（精确scope、官方锁定依赖、生成索引--check、六项目录合同及静态依赖）→ 稳定汇总；独立publication workflow以实际相关性处理。5分钟报告等待项，不扩平台全量。用户已确认本教师批次公开允许材料和Draft，主线串行协调合并；不部署。

未验证/不声称：题项平台再使用与外部电子施测授权、正式完整施测复现、英语独立效度/中文版/英语学生题本、跨角色差分阈值、生产/管理员自建库排重、浏览器排版、真实参与者测评、生产迁移/备份恢复或开发/生产安装。
