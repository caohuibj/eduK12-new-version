# Training 纵向验证：基线失败逐项保留

冻结检查点为 `1d976f53622b25e84846fdbc7e2f6366aa18ab90`。以下 11 项为原集成候选既存失败；本轮没有修改这些断言或守卫，也未重跑它们。

原比较基线为 `6fedb640fdd0700b9c1ca9974bf417b5a43cf58c`（#355 指定候选＋#356 三补丁），不是 main 或已通过 CI 的基线。
在独立 archive 副本上仅重跑当时失败的 11 个名字，全部复现，名字和第一错误与候选一致；原报告 exit 1、0 passed、11 failed、3 filtered。

文件均为 `server-version/backend/src/__tests__/measurement-content/survey-content-binding.test.ts`。

| 序号 | 原始用例名（共同前缀 Survey START exact encrypted content binding） | 分类 |
| --- | --- | --- |
| 1 | stores only exact selected pointers, empty population and report availability under CAS | 既存，未由本批引入 |
| 2 | keeps frozen SUPERSEDED measurement/report identities for START | 既存，未由本批引入 |
| 3 | keeps frozen RETIRED measurement/report identities for START | 既存，未由本批引入 |
| 4 | denies revoked measurement but records revoked report as unavailable without blocking collection | 既存，未由本批引入 |
| 5 | records reference REVOKED as unavailable | 既存，未由本批引入 |
| 6 | records reference RETIRED as unavailable | 既存，未由本批引入 |
| 7 | preserves superseded reference candidate and refuses to infer missing population | 既存，未由本批引入 |
| 8 | binds new native measurement without selections to empty references and leaves legacy/FORM-only rows null | 既存，未由本批引入 |
| 9 | recovers original binding without reselecting or rewriting after release retirement/revocation | 既存，未由本批引入 |
| 10 | fails changed stored hash, wrong Attempt, corrupted publication, and CAS conflict | 既存，未由本批引入 |
| 11 | pure recovery validates report and selected reference membership without choosing again | 既存，未由本批引入 |

共同错误为 `ScaleLibraryError: 量表依赖身份不完整`（第 1 项以 rejected promise 包裹）。原内存 SQL fixture 将 attempt 行返回给递归 C 祖先查询，现有收集守卫据此拒绝；不将这种拒绝当成新的权限通过证据。

原始证据：`docs/evidence/tool-onboarding-next-20261025/preflight-validation.json`。比较原始 reporter SHA256 为 `002b86bf9501764137ae210319a2172b0b6dbfa8c418aa065d79dfa0188c1abb`，候选既有消费者报告 SHA256 为 `4707a368c3dd7d94f85680f6c955c59b001fd71a30af14598ffe53817fa7e62b`。

## 本轮新结果单列

本轮通过现有正式安装、HIDDEN 发布、批准和真实试运行路径创建原创合成两题工具，只存在于 opt-in 测试注册输入和专用 loopback 数据库。不会复制 dot 的许可、授权或试运行记录，也不会手工置 ONLINE。

首轮在测试收集前被真实 source 注册校验拒绝：合成报告缺少现有 audience QC／说明长度／反思行动字段，0 个业务用例完成。只补齐原创测试 fixture 内容，未放宽校验。

第二至第五次执行分别暴露测试驱动的 DTO 取值、旧版表单 hash、对已发布对象调用草稿预检、遗漏当前上下文 hash 的问题。原始拒绝和失败均保留，没有弱化服务断言。修正测试驱动后，正式 install／HIDDEN publish、SYSTEM 批准、三组真实评分／报告试运行、提交后回读及 ONLINE 转换、现有 21B 与精确用户使用权的 HTTP 发行和幂等重试、教师固定组合发布、学生 START／上下文提交均已实际执行成功；没有手工设置 ONLINE 或复制 dot 的证明。

第六次执行中，真实学生 FINAL 与幂等重试返回 200，唯一规范量表结果已保存，合成合计为 12。随后测试在父作答状态断言失败：期望 COMPLETED、实际 IN_PROGRESS。原因尚未定位，完整 P/R 读取未验证；不能归入上述 11 项既存失败，也不能在未比较前认定为本批代码回归。

用户随后要求暂停开发、只备份已完成部分。当前停止在上述结果，不再修订。新纵向 fixture／驱动与教师版本摘要改动留在本地，未加入本次远端备份。日志 `/workspace/tool-onboarding-vertical-attempt1..6.log`、各 JSON reporter／SQL-HTTP trace 与隔离数据均保留；未记录真实答卷或生产账号。
