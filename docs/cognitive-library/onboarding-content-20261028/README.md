# Cognitive content integration and structural audit

Base main: `642fda7ab754790686d6626efac62b73a332e663` (scale and cognitive onboarding mechanisms merged).
Existing PR360 source: `072b2900d4295c7d741d5e55c9ce6cfbbf6f58d2`.
This branch preserves existing content and implementation history rather than
rebuilding candidates. It is an unqualified integration draft, not an activated
library or a deployment. Original PR360 remains unchanged.

## First repair batch

Six existing package descriptors listed report fields in tiers different from
their metric visibility. They failed the current generic publication structure
validator despite having custom candidate reports. Separate commits align only
those previously declared report fields:

- attentional-blink: validTrialCount → user.
- balloon-effort: validChoiceCount and highEffortChoiceCount → user.
- dual-arrow: validTrialCount → user; receivedTrialCount → detail.
- gradcpt: medianCorrectRT → user; presentedImageCount → detail.
- horizon-exploration: validFirstChoiceCount → headline; completedGameCount → user;
  receivedGameCount → detail. These three counters already appear in the custom
  public projection, and are quality/context fields, not ability scores.
- visual-search: accuracy → user; receivedTrialCount → detail.

No task stimulus, sequencing, counts, scoring formula, quality state, timing,
input behavior, report wording, reference or authorization was changed. Research
maps, arrays and reportBinding remain research_only. Existing protocol/config/
scorer identities and frozen report projection contracts remain unchanged; this
is correction of unpublished candidate descriptor consistency, not retroactive
recalculation or replacement of installed versions. No norms are invented.

Root ran only the new direct structural consumer check on these six changed
packages: six passed, zero failed. It checks generic validation, runtime compiler,
matching declared tiers, research-only maps/arrays, DRAFT state and absent norms.
Original JSON and log are in `evidence/report-visibility.*`. This does not execute
scorers, prove scientific validity, qualify browsers or establish database
installation. Original test histories stay in the source branch.

## Remaining work, not silently passed

- Review current source/scoring/parameter/report combinations and necessary raw
  score examples for each admitted package; use unchanged qualified evidence.
- Share existing native configuration factories with selected installation,
  without two registries or importing Prisma seed files across src rootDir.
- Verify installation preview/idempotence/frozen identity in an isolated database.
- Preserve public/anonymous/organization raw-archive authority boundaries. Native
  Training support is not automatically all four entry adapters or public usage.
- Real library registration, publication, entry assignment and deployment each
  need their actual execution evidence. Source presence is not installation.
- PR330 remains source/design material, not an executable candidate to recount.

Full integration CI has not run. The inherited PR365 exact CI binding is not a
valid binding for this new content branch; no Ready or activation is requested.
Only this batch's directly affected structural check has run on this candidate.

## 接续首批：共享 native 配置与隔离安装

逐包事实与范围见 [batch-queue.md](batch-queue.md)。原有 MOT 与点数判断配置
工厂移入 src 的既有 native-registry 区域，Prisma 保持重导出；selected installer
由同一精确来源解析，未复制配置或改动注册/生命周期/权限 guard。原配置哈希不变。

本节点新建隔离 PostgreSQL（无全量 seed）实际安装这两个 DRAFT/GRANT 配置，
两 profile 分别冻结而不增配置行；重复安装保留原行、仅两条审计；没有发布指针或
assignment。冲突保留、不覆盖。原失败夹具及仅失败用例续验均留存，详见
[evidence/native-install-receipt.json](evidence/native-install-receipt.json) 和
[evidence/native-postgres.json](evidence/native-postgres.json)。实际 CLI preview 读取
同一隔离库，MOT 为 ALREADY_PRESENT、被夹具故意改名且 RETIRED 的点数判断为
IMMUTABLE_CONFIG_CONFLICT，预期退出 2；不是一次新的失败安装或正式库结果。

源码可选安装、隔离库已安装、正式公共库发布、真实四入口可用是四件不同的事。
后两项未执行；原件 composite/access-token guard 未动，School/Teacher 适配仍待
root 协调。没有新增科研/版权审查门禁，也没有将现有候选重算为新开发。

## 接续首批：气球努力说明与报告

- 说明页已补中英文三步操作路线与“完成正式轮次＋收到保存确认”的区别。保持原
  规则、例子、时长范围、练习数量/门槛、输入和关键时序。
- 报告复用 `CognitiveReportVisual`，仅消费通过 `isEffortReport` 的公开冻结投影。
  一张条件比较小图＋真实次数表，图注列 high/valid 及未选择；0/6 为真实 0%，
  无有效选择为 —，invalid 完全不画表现图。原冻结报告文字、协议、计分与版本
  身份未改；没有制造常模/能力分，也没有读取内部科研字段或增加下载引擎。
- 共享图表增加可选英文/缺失文案、英文按单词换行；缺失条形额外显示 —。
  既有中文默认和有符号数值保持，图形之外仍有文字和数据列表。

可直接查看：[手机说明](evidence/intro-zh-phone.png)、
[手机报告](evidence/report-zh-phone.png)、
[英文受限报告](evidence/report-limited-en-phone.png)、
[无效报告](evidence/report-invalid-zh-phone.png)、
[平板英文报告](evidence/report-en-tablet.png)。均明确标注合成预览/未发布。
[200%示例](evidence/report-en-200pct.png) 是 CSS zoom 压力预览，不冒充原生设备验收。

报告示例来自真实 capture/scorer/公开投影的合成记录，完整输入与逐条件结果可读：
[raw](evidence/effort-synthetic-raw.json)、
[public reports](evidence/effort-synthetic-public-reports.json)。18次示例中，
50次基准为6/6、100次基准为0/6、200次基准为4/6；缺失与真实零不同。
新增断言实际通过合计3项（分次原始报告，不冒称整条失败命令成功），最终直接类型
检查零诊断；最终5张受影响报告截图＋3张复用说明截图无横向溢出。原夹具失败、
原命令/退出、类型夹具漏项与浏览器外层沙箱限制均留存，见
[完整回执](evidence/effort-presentation-receipt.json)。没有重跑原scorer整套或全平台。

## 本阶段剩余项与交给 root 的最小建议

1. 独审上述三项提交、实际配置哈希、PostgreSQL断言、合成计分输入与最终截图。
   PR365 的旧 CI pin 不能用于 PR368；本节点没有激活 CI、Ready、merge 或部署。
2. 正式运行库目标和安装身份待 root 协调；此处仅隔离 DRAFT，不能当作公共发布。
3. 保留 `raw-archive.service.ts` 对 composite/access-token/无 userId 的拒绝，
   `assertNativeDeliverySupported` 对 public/未支持身份的拒绝；不能用 Training
   cookie 冒称 School/Teacher/Survey 成功。先明确各入口原件端口与真实身份范围，
   再做相应最小适配；权限/schema改变另给 root 建议，本批不做。
4. 连续图像再认／ANT 是“已有后端定义、产品宿主未接”，另外8包是“已有独立候选、
   未注册产品入口”。下一批复用既有实现，核精确配置与原件端口后逐项接线，不重做。
   剩余各包说明/报告的结构审阅和呈现优化仍在逐包队列，未被本批的单工具截图代替。
5. 科研质量、人群、译审、素材版权状态仍按原记录人工处理，未新增为自动准入门禁。

GitHub 连接器的 PR 读取两次返回 Transport closed；实际 push 和分支精确 SHA 由
Git 成功读回。没有把连接器失败读数当成当前 PR metadata 或 CI 绿灯。
