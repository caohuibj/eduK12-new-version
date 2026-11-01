# 儿童认知控制与自我调节 Bundle 草稿

基线是实际拉取的 main `24061f5e349d1f8df34b0ed5dd99a33e3014da8c`。
本次准备共享 CHEXI 内容工厂、家长／教师两个观察配置、Go/No-Go＋Flanker
声明式任务组件和私有全文待审包。**尚未注册、安装、发布或部署，尚无跨尝试联合报告。**

官方全文及完整source交付到[私有管理员资料页](https://chatgpt.com/space/page_c972d4e600b481919eb8498d3d346d31)，链接不授予额外访问权。

## 家长和教师应共享什么

[官方译本页](https://chexi.se/translations)只提供一份 CHEXI parent/teacher report；
[官方简体 PDF](https://chexi.se/onewebmedia/Child%20Executive%20Functioning%20Inventory_SimplifiedChinese.pdf)
标题明确为家长及教师适用。英语题本也是同一份 parent/teacher report，
[计分说明](https://chexi.se/onewebmedia/CHEXI%20subscales.pdf)没有按报告者分叉。
因此共享同一个 `chexi_zh_hans@1.0.0`、24题、1–5选项、指导语和计分；
只保留两个观察者配置及入口，不复制两套题本或量表。

家长描述家庭及生活情境，教师描述课堂和学校活动；保留各自真实观察者、关系、同意和报告访问权。
不能把两个分数平均，也不能把“题目一致”当成家庭和学校观察可互换的证据。
中文版署名 Angela Siu，The Chinese University of Hong Kong；不是项目自编或项目新译本。
PDF中的混用字形原样保留，只去掉排版换行和答题数字列。

## 已准备的内容

| 内容 | 当前产物与边界 |
| --- | --- |
| CHEXI | `scale/packages/chexi-zh-hans-v1.ts`，用官方原文装配既有 `ScaleInstrumentSourceV1`；不新造计分器。公开 Git 不含题文。 |
| 家长／教师 | `childChexiObserverDefinition` 返回两个合法 DRAFT observer 配置，同一工具身份和计分选择；未接入 bootstrap。 |
| 儿童任务 | `assessment-bundle/intake-candidates/child_cognitive_tasks_zh_cn/0.1.0` 使用既有 `declarative-evidence-v1@1.0.0`、精确任务版本和四个合成 fixture；不进入自动目录扫描。 |
| 私有全文 | 官方中英文题本、彩色计分题本、计分PDF、来源网页、译者身份、24题可执行DRAFT source JSON、验证结果与候选配置。 |

CHEXI四个原始分面的题号为工作记忆1、3、6、7、9、19、21、23、24；计划12、14、17、20；
调节2、4、8、11、15；抑制5、10、13、16、18、22。
两个因子分别合并工作记忆＋计划（13题）及抑制＋调节（11题）。
均以各自题目直接求均分，范围1–5，高分表示观察到的困难更多；不能平均两个大小不同分面的均分。
两个因子和四个分面互相重叠，不再求总分。缺失均分为空；完整作答要求是项目保守策略，
不是作者给出的插补办法。无反向题、无年龄常模、无缺陷阈值。

## 年龄和任务

| 年龄 | 本次定位 | 尚需的实际证据 |
| --- | --- | --- |
| 4–5 | CHEXI观察资料准备；任务配置不开放为该年龄已适用 | 规则理解、颜色／方向辨识、练习、反应方式、时序与负担 |
| 6–8 | 拟优先开展有协助的任务试测；不是已验证适用 | 每项任务理解、练习通过与中断、设备和疲劳 |
| 9–12 | 拟试测同一任务组件；仍无年龄常模 | 同上，并独立核查分龄表现和稳定性 |

6岁下限是本项目草稿的分阶段选择，不是由CHEXI、NIH Toolbox或其他儿童范式推导的效度结论。
Go/No-Go复用 `gonogo/config1.0.0/engine1.0.0/scoring1.0.0/standard`（120试次），
Flanker复用相同三轴版本及standard（80试次）；不改刺激、练习、时序或任务实现。
两任务各约5–7分钟是现有配置估计，尚无本次儿童实测；CHEXI10分钟也是项目估计。
保留 `cpt@1.0.0`（180试次）为持续注意扩展，避免首版堆积疲劳。
SDQ不作为核心依赖；只有明确需要独立情绪／行为背景时再附加并保留自身授权和报告。

## 当前源码限制和接线方案

1. `assessment-bundle/definition.ts` 仅允许 observer 使用PARENT/TEACHER，其他类别只能SELF。
   `onboarding/contract.ts` 的声明式包也将 `respondentTypes` 固定为 `[SELF]`。
   因而不能把儿童任务与成人CHEXI声明成一个当前可投放的混合包。
2. `assessment-relational` 与既有身份表已经保存 `subjectUserId`、`respondentUserId`、
   `episodeId`、`assignmentRef`、`consentId`，并检查真实亲子关系或课程roster。
   但 `product.service.ts` 当前每次分配分别创建episode，生产关系产品注册表为空，
   `MULTI_INFORMANT_SYNTHESIS` 明确保留而未实现。只有字段存在不能证明跨方法关联已可用。
3. 普通 `bundle-product/service.ts` 把所有槽位投到一个Composite尝试；
   当前没有为混合报告者分别分发和汇集已冻结结果的接线。不能仅放宽schema或换一个respondent标签。
4. `onboarding/dependencies.ts` 要求指标valueType完全相同；Go/No-Go计数是 `integer`，
   声明式证据只有 `number/string/boolean`，因此三个计数分母目前返回selector/type/unit mismatch。
   候选保留真实指标与分母并明确失败原因，不改成比例来骗过检查。

下一片最小共享工作应复用现有episode／assignment／consent：一次儿童评估下分别分配儿童SELF任务
及家长或教师观察尝试，持久绑定同一subject和明确评估轮次；对返回的真实冻结结果逐项核对
subject、respondent、assignment、精确来源、完成与同意／可见范围，再交给既有声明式报告引擎。
不得只按姓名、时间接近或同一subject自动配对不同轮次；不得让家长或教师执行儿童认知任务。
逐一保留缺失、有限、无效与不可用状态，不因任务和观察同时有数字就宣称一致或不一致。
报告继续保存既有BundleReportFacts，历史读取不重新计分，不新建身份表、引擎、哈希或审核体系。
计数契约可单独研究将现有integer视为number的合法子类，保留单位及实际值检查；本PR未改共享验证器。

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

## 验证与交付状态

使用既有通用Scale scorer验证官方私有source：24题，schema与全部golden cases通过，0 issues。
公开合成内容的6个定向case分别覆盖两观察者共用身份、每道题的两个因子和四分面归属、
不等题数的加权含义、缺失为空、无总分／常模、精确任务版本、负差值／真零、现有拒绝边界。
首轮4过2失败（证据key误用camelCase）；改为snake_case后1过1失败（真实integer契约不匹配）；
保留该缺口并验证明确blocker后最后一项通过。无失败改写，未重跑未受影响的成功case。
两新增生产TS根及其309文件类型闭包检查通过（TypeScript5.9.3，0诊断）。

验证复用了本机已有依赖；基线lock相较预装目录只变化follow-redirects1.16.1→1.16.2，
本次消费者不导入它。没有声称干净锁定安装、正式CI、浏览器、儿童实机、PG集成或生产入库通过。
public generated registries、BundleReport、schema、依赖、CI和生产DB未修改。
本候选保留DRAFT供主对话独立review；正式CI与共享接线由精确最终候选再定向处理。
