# DAS-A 来源记录

## 工具

- 名称：Dysfunctional Attitude Scale, Form A（DAS-A），40题
- 原作者：Antonette N. Weissman & Aaron T. Beck（1978），由100题原版精简为A/B平行表
- 原始文献：Weissman AN, Beck AT. Development and validation of the Dysfunctional Attitude Scale: A preliminary investigation. Paper presented at the meeting of the American Educational Research Association, Toronto, 1978.

## 题本转录来源

- 实际转录来源：https://beckinstitute.org/wp-content/uploads/2021/06/DAS-Full-Documents-1.pdf （Beck Institute 评估工具页公开下载，50页，含100题原版、DAS-A、DAS-B、计分说明与两篇因子结构论文）
- **注意**：该PDF第1–9页是100题原版表单；**DAS-A 40题在第11–15页**。40题自DAS-A页逐字誊入（弯引号保留；第7/16/26/36题混入的页眉已剔除并逐题核对）。
- 指导语：“REMEMBER, ANSWER EACH STATEMENT ACCORDING TO THE WAY YOU THINK MOST OF THE TIME”（表单页原文，全大写）。

## 版本与冲突

- 官方计分表（PDF第22页“DAS SCORING”）：每题1–7；30个失调信念题“完全同意=7”递减计分；10个功能信念题“完全同意=1”递增计分；总分=全部求和（40–280）。
- FORM A 功能题（反向键）：**2、6、12、17、24、29、30、35、37、40**；FORM B 为 1、5、12、30、14、33、19、36、20、26（#12/#30 两表共用，本实现只做A表）。
- 反向键与 de Graaf et al. (2009, cognitive therapy and research；PMC2712063) 对 Weissman & Beck (1978) 计分键的引用完全一致；该文同时指出反向题在大样本中呈负题总相关（方法因子），已写入报告局限。
- 首次提取误取了100题原版的前40题（含“41. 42.”连续编号的表单），已废弃；正确DAS-A题序与100题版不同。

## 计分

- 反向公式：8−原始作答（7点量表）。
- 总分范围40–280；均值1–7。分数越高代表失调态度越强。
- 缺答：原说明“omits coded as zero (missing data)；大量缺答时整份作废”。产品采用更严格的 complete_required（任一题缺答则不计算），已在记录中标注为产品保守约定。

## 许可

- Beck Institute 评估工具页公开提供下载；页面未列明再分发、翻译或商业条款。
- 不声称商业、翻译或再分发授权；中文译题未交付。
