# KIMS-39 来源记录

## 工具

- 名称：Kentucky Inventory of Mindfulness Skills（KIMS），39题
- 原作者：Ruth A. Baer（University of Kentucky）
- 原始文献：Baer RA, Smith GT, Allen KB. Assessment of mindfulness by self-report: The Kentucky Inventory of Mindfulness Skills. Assessment. 2004;11(3):191–206.

## 题本转录来源

- 实际转录来源：https://www.ruthbaer.com/academics/KIMS.pdf （开发者官网随表下载，含39题题本与计分说明页）
- 39题自该PDF逐字誊入（保留弯引号与原标点）。
- 官方计分页（同PDF）：反向题记R，1↔5、2↔4互换；Observe 1/5/9/13/17/21/25/29/30/33/37/39；Describe 2/6/10/14R/18R/22R/26/34；Act with awareness 3R/7/11R/15/19/23R/27R/31R/35R/38；Accept without judgment 4R/8R/12R/16R/20R/24R/28R/32R/36R；各分量表分别求和。

## 版本与冲突

- 本实现严格按官方计分页：四个分量表求和，不定义总分。
- 官方计分页与原文一致，无发现冲突；观察维在无正念经验样本中与其他维相关较低（原文说明），故不提供跨维合计。

## 计分

- 反向题18个（3,4,8,11,12,14,16,18,20,22,23,24,27,28,31,32,35,36），反向公式 6−原始作答。
- 分量表范围：观察12–60、描述8–40、有觉知行动10–50、不评判接纳9–45。
- 缺答：产品采用 complete_required（任一所属题目缺答则该分数不计算）；这不是原作者的缺答规则，是产品保守约定。

## 许可

- 题本与计分说明自开发者官网公开下载；页面未列明确再分发、翻译或商业条款。
- 不声称商业、翻译或再分发授权；中文译题未交付。
