# 儿童认知控制与日常观察

基线：实际拉取的 main `24061f5e349d1f8df34b0ed5dd99a33e3014da8c`。
儿童本人完成 Go/No-Go 与 Flanker；家长、教师以各自账号填写 CHEXI。
一次分配复用同一儿童、同一 episode 和既有关系分配；分别保留三个来源，生成跨方法描述报告。
不生成综合能力分、IQ、诊断、常模排名或未经验证的能力等级。

## 家长／教师内容复用

[官方译本页](https://chexi.se/translations)、[简体题本](https://chexi.se/onewebmedia/Child%20Executive%20Functioning%20Inventory_SimplifiedChinese.pdf)
与[计分原件](https://chexi.se/onewebmedia/CHEXI%20subscales.pdf)提供同一份家长／教师题本和计分。
共享 `chexi_zh_hans@1.0.0` 的24题、1–5选项、指导语与计分，仅保留两个报告者配置及家庭／课堂情境说明。
官方译者为 Angela Siu（香港中文大学）；原文混用字形保留，仅整理 PDF 排版换行。
两位观察者的结果不平均，不以题本相同推断跨报告者可互换。

工作记忆原分面题号1、3、6、7、9、19、21、23、24；计划12、14、17、20；
调节2、4、8、11、15；抑制5、10、13、16、18、22。
两个因子分别合并工作记忆＋计划（13题）和抑制＋调节（11题），直接计算各自题目均分。
不能平均不等题数的分面均分；无反向题和总分。高分表示成人观察到更多相关困难。
缺题的相关均分为空，完整作答要求是项目保守策略，未冒充作者的插补规则。

## 实现

六个 `assessment-bundle/packages/*/0.1.0` 包含儿童任务、两个单观察者组件，以及家长、教师、两者并列三种联合报告配置。
都使用现有声明式引擎、冻结定义、BundleReportFacts 与 BundleAnalysis，不新增表、计分器、身份或审批系统。

`/api/child-cognitive-control` 提供教师分配、本人待办、家长接受既有分享同意、START、单项报告、汇集和保存报告读取。
前端入口 `/relational/child-control` 从既有课程名单和已关联家长选择，不按姓名或时间推测配对。
联合记录复用现有 REANALYSIS purpose 及原因字段；普通单尝试报告接口拒绝跨来源记录，防止绕过观察者同意检查。
同一请求并发重试保持同一 episode 和来源分配；每份尝试的 subject、respondent、assignment、episode、精确工具版本、epoch 与输入摘要须相符。
普通单人创建拒绝混合报告者包。成人观察准入仅接受本产品轮次下已同意、身份吻合的单观察者组件，使用儿童的有效课程名单关系；成人不能启动儿童认知任务。
观察表先用已有出生年月表单收集儿童背景并冻结其 subject 绑定，按 CHEXI 原适用范围检查年龄。

联合报告仅向分配教师提供，保留家长与教师独立均分及任务指标；缺少作答时等待，缺失指标不补零。
读取保存报告只校验已有身份、epoch、输入摘要、同意及冻结披露策略，不再加载全部任务结果或重新计分。
家长撤销同意后教师不能读取联合结果。数字、解释、质量信息及 JSON 导出均遵从实际冻结来源的披露能力。
报告复用现有 BundleReport；增加授权读取回调供跨报告者 JSON 导出。现有报告 audienceContract 的个体解释上限继续生效，缺少教师解读合同不会升级为个体解读权限。
图表使用成人线 #484 的共享组件；本线提供 `bundle-child-evidence-display.ts` 及已验证可应用的 `docs/child-shared-display-integration.patch`，由共享展示负责人接入两行导入／词汇扩展并改为“问卷来源”，避免将成人观察标成自评。

## 年龄与任务边界

Go/No-Go 复用 config/engine/scoring `1.0.0`、standard120试次；Flanker复用相同三轴版本、standard80试次。
不改刺激、时序、练习或任务实现。CPT180试次保留为持续注意扩展；SDQ仅在需要独立背景时另附。
CHEXI 的4–12岁范围不证明任务适合所有4岁儿童。4–5、6–8、9–12岁的规则理解、练习通过、设备、反应稳定性和负担需分别积累证据。
没有人为增加6岁任务门禁，没有把可运行冒充已验证；目前没有本项目儿童常模或实机效度结论。

## 私有全文导入

公开 Git 只有装配工厂、计分、配置和公开来源链接，不含完整官方题文。
私有包携带官方中英文题本、计分原件、网站、研究全文取得状态、完整 source 和标准 instrument/source 私有构建叠加目录。
`tsx src/scripts/import-private-scale-draft.ts --source <private-source.json> --actor <SYSTEM_ADMIN-id> --apply`
调用既有 materializer，生成隐藏 DRAFT；不激活、授权或发布。正式运行使用私有构建中的同一 source，并沿用现有管理员最终人工审核及发布。
未知授权范围保留标签，不阻止 DRAFT 内容导入。

## 来源与授权

全部取得的CHEXI源材料来自公开作者网站；没有把非公开文件说成公开材料。
作者网站说明现有语言版使用无需另征作者许可；这不等于已经核实公开Git再分发、
商业部署和具体数字施测范围。本次用 `rights:official_free_use`、
`rights:public_redistribution_unknown`、`rights:commercial_scope_unknown` 等标签保留真实状态，
不据此阻止私有DRAFT资料准备，也不伪造持久授权记录。

| Reference | 本次取得情况和可支持内容 |
| --- | --- |
| [Thorell & Nyberg 2008](https://pubmed.ncbi.nlm.nih.gov/18568903/)，doi:10.1080/87565640802101516，Developmental Neuropsychology 33(4), 536–552 | 原始开发文献的出版元数据和摘要已核实；本次未取得出版全文。支持量表身份及多方法互补方向，不是本项目任务的效度。 |
| [Thorell et al. 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3827673/)，doi:10.1080/09297049.2012.727792，Child Neuropsychology 19(6), 630–638 | 公开PMC全文已保存到私有包；6–11岁跨文化家长／教师研究。文化与报告者结果不能简单互换，不绑定为本项目常模。 |
| [Camerota et al. 2018](https://pubmed.ncbi.nlm.nih.gov/27841094/)，doi:10.1080/09297049.2016.1247795，Child Neuropsychology 24(3), 322–337 | 出版元数据和摘要已核实，本次未取得全文；美国3–5岁研究不直接验证本项目6–12岁中文数字施测。 |
| [官方下载页](https://chexi.se/translations)、[计分页](https://chexi.se/subscales1)、[研究目录](https://chexi.se/research1) | 网页及官方中英文题本／计分PDF已保存。网站研究目录原始论文页码有526的笔误，本记录使用PubMed出版页码536–552。 |

## 验证与交付

本次真实隔离 PostgreSQL 已完成官方24题 source 的隐藏 DRAFT 导入；无生产入库或部署。
定向单元、契约、前端与 PostgreSQL 施测结果及失败修复记录保存在私有交付包；最终统计见 [儿童线验证记录](cognitive-control-child-validation-20261101.json)。
复用预装依赖和重新按当前 schema 生成的 Prisma client；不声称干净锁定安装、全平台 CI、浏览器或儿童实机验证。

集成依赖 #484 `dd8081a354d40f1149a97d92f00beadd45005f5b` 的 integer→number 合法子类兼容，精确指标、版本和单位继续严格检查。
本线没有重复修改该验证器，也不覆盖公共 generated/packages.json；最终由主线合并三线 package 清单后统一生成。
当前为 [PR485](https://github.com/caohuibj/eduK12-new-version/pull/485) 的可审代码及私有全文包；未合并、未部署、未生产发布。
