# BAT12 独立 Draft PR 与最小正式路线草稿

业务源固定 `af56bca1560fe2043f7b5788a19d8f7f1998c6f4`，基线main `dc796e04203696b4a579aa6fd2428df592031ee3`。只包含原独立报告语言校验＋BAT12 DRAFT源；不含TALIS另一分支、JD-R模型/参数/标签权限或教育UI。

拟Draft标题：`feat(scale): support separate report locale for BAT12 teacher feedback`。拟正文仅说明：既有冻结报告版本可声明与英文题本不同的报告语言，并加入DRAFT BAT12中文教师反馈；测量/计分与来源披露不变。此前PR393正文/Notion的披露拒绝未重试，本草稿不含内部账号、运行日志或附件原件。尚未创建新PR，避免独立审阅前由opened事件启动CI。

## 接通范围

复用现有onboarding-structure与stable gate，只改原scope/bindings/checks/evidence/controls.test/ci.yml六文件。旧根记录与393记录保持；新候选按已知精确分支先绑定，PR编号null、enabled=false、reviewer/decision=PENDING。未知分支与重复身份拒绝，不回退平台。独立审阅后才创建Draft、读回真实PR编号并以数据更新绑定；正式Ready前还需真实审核记录和完整source/merge/mode/blob/component/control检查。没有新workflow、签名、权限服务或审批平台。

只接纳原Vitest三例PASS（四例原过滤保留），以及原selected命令实际exit0/stdout/result/runner/13输入hash。原命令不是Vitest报告，不改造/重签历史；DRAFT和administrationEligibility:not-evaluated仍保留，五golden／六不同输入不重跑。原unsigned/回顾性源关联和缺少完整安装环境证明明确保留。原始命令reader只读精确字节；当前全后端另由绑定产品tree和完整diff闭包保护。

唯一缺失应用检查仍放原admission：官方源锁定backend依赖、Prisma generate（不连DB）、当前组合后端tsc --noEmit及真实退出/日志receipt。CodeQL只选变化的scale报告gate、BAT12声明、两个直接测试及控制源码；保持原查询/SARIF策略与预算。原stable gate须scope/admission/CodeQL都实际成功。无前端改动，不构建前端；不执行数据库、模型、浏览器或其他量表回归。main push仅核精确merge，不重跑应用检查。

## 控制验证原件

本片没有重复BAT12三例、selected checker或其他应用验证。第一控制命令仅选三个BAT12新控制和两个受候选选择/YAML变动影响的393旧控制：4 PASS/1 FAIL。失败是新负例错选了不在历史13文件manifest中的scale-definition.ts；原命令reader不声称单独覆盖全内核，整体source/tree检查负责该闭包，已另有scale-scoring.ts越界拒绝断言。只把负例改为实际已记录的audience-report-gate.ts字节漂移，单独复验该失败控制，1 PASS/exit0；原4PASS及失败完整保留。不向历史manifest补造内核hash，不重跑其余控制或应用。

候选在此阶段仍未审完；尚无CI/Ready/merge/装载/部署结果。正式资格预算约5分钟，CodeQL保留原30分钟，不承诺短时完成。旧PR381历史schema失败及393的Draft失败保持其原身份，本片不修无关历史。
