# C11 SJT 课程链：实现检查点

2026-10-18，基于 `a5be4c6fa40ba15d945f20dd4588666b3c0885e5`，仅当前助手云节点开发；不操作 Mac、生产、PR 或 CI。

## 冻结范围

- 正式上传 release 与内置题包共用异步精确版本解析。单次操作批量去重，发布/复制/编制校验不读取整个上传目录；原父子事务在首次准入时锁定上传 release，retire 串行且失败回滚全部父子事实。
- 已存在 embedded attempt 先读取其原冻结事实，不以当前目录状态重新决定恢复或计分。当前 releaseStatus 仅元数据投影。课程、成员、次数、截止、principal 与 epoch 原检查保留。
- 资源列表仅投影公开摘要，不加载完整包/答案键。教师自评题包不得编入学员课程；合法学生型上传保留 PILOT 科学上下文与原评分。
- 原公共导出批量读取 accepted canonical snapshot，只追加 SJT 指标、quality、version/hash/null 摘要及其指纹。无 SJT raw/模板读取、不新增评分器/runtime/worker；独立研究导出 embedded 拒绝和 grants 不变。
- 无迁移。C12 多情境/受控多选新协议、C13 完整许可/图片未实现。

## 本检查点真实状态

- 独立 backend npm ci（原锁文件、官方 registry、缓存离线命中）成功；fresh Prisma Client 5.22.0。
- Node 24.21.0 下，measurement.lock 独占运行全部原 build 前置（bundle manifest/onboarding、situational manifest/onboarding、scale instruments/onboarding/qualification）与 TypeScript 编译成功。
- 针对性单测、真实 PostgreSQL/HTTP 全链、retire 竞争正在准备，尚未声称通过。
- 新 HTTP harness 尚未冻结；历史 authoring / situational-bundle 资产仅复用源码，不冒称本候选已验收。
- 浏览器留 C25；当前已知 Chromium EPERM 不重试绕过。性能留 C26，此处仅查询/存储诊断，不声称收益。

## 接续检查

主要执行位置为当前云节点，重型检查串行：精确解析/上传/原SJT/bundle/导出/受影响课程单测；真实教师上传学生型→另一管理员审核→课程发布→成员开始/恢复→FINAL/replay→parent/公共报告→原队列 CSV/ZIP；自审/跨课/非会员/非owner/错respondent；retire 首准入竞争无残留；旧builtin匿名与受影响 C09/C10 混合短链。保留失败原日志并绑定最终源码、dist、配置和工具，不把备份当CI成功。
