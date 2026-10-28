# ATQ-30 来源记录

## 工具

- 名称：Automatic Thoughts Questionnaire（ATQ），30题频率版
- 原作者：Philip C. Kendall & Steven D. Hollon (1980)
- 原始文献：Hollon SD, Kendall PC. Cognitive self-statements in depression: Development of an Automatic Thoughts Questionnaire. Cognitive Therapy and Research, 1980, 4(4), 383–395.

## 题本转录来源

- 实际转录来源：https://dradamvolungis.com/wp-content/uploads/2020/06/automatic-thoughts-questionnaire.pdf （第三方公开教学资料，含说明页与30题逐题页）
- 该资料说明页声明：30题测量消极自动思维频率；计分为全部30题求和；因子题号 PMDC 7/10/14/20/26，NSNE 2/3/9/21/23/24/28，LSE 17/18，Helplessness 29/30；α=.97。
- 题文自该PDF逐字誊入（30题，保留原文标点，包括部分题末无句号）。

## 版本与冲突

- 本实现为“频率”单列版（1=not at all … 5=all the time，回忆时段为过去一周）。
- 该PDF同一题本为 ATQ-B 双列版（频率 + 想法可信度 1–5）；本次仅实现频率列，可信度列未实现，未混计。
- 第三方转录未经原作者核对；发布前须与原版或授权副本逐题核对。资料中个别题目行末标点在原版中可能不同。

## 计分

- 无反向题；总分=30题求和，范围30–150。
- 四个因子仅覆盖其题号内题目（共16题），其余14题只计入总分；因子为求和分，不是标准化分量表分。
- 缺答：产品采用 complete_required（任一所属题目缺答则该分数不计算）；这不是原作者的缺答规则，是产品保守约定。

## 许可

- 第三方资料未声明再分发条款；未取得 Hollon/Kendall 或出版方（Springer）授权。
- 不声称商业、翻译或再分发授权；中文译题未交付。
