# TMS-13（Toronto Mindfulness Scale）源与计分记录

## 来源

- 题本 PDF：Lau et al. (2006) 原始论文全文（机构仓库 Rotman-Baycrest 托管副本），23 页。
  - PDF 直链：https://www.rotman-baycrest.on.ca/files/publicationmodule/@random45f5724eba2f8/pid3280.pdf
- 工作副本 SHA-256：`871ed6c1706caddb1965b03b5bfdd4577fa589dee31fad94930d7831997de154`（201,103 字节）。
- 提取文本：`_prdata/pdfs/tms_lau2006_extract.txt`（pypdf，逐字底本）。
- 原始文献（论文页脚）：Lau, M. A., Bishop, S. R., Segal, Z. V., Buis, T., Anderson, N. D., Carlson, L., Shapiro, S., & Carmody, J. (2006). The Toronto Mindfulness Scale: Development and validation. *Journal of Clinical Psychology*, 62(12), 1445–1467. DOI: 10.1002/jclp.20326。
- 许可说明（如实记录）：期刊论文为 Wiley 付费墙内容；本副本为多伦多 Rotman-Baycrest 机构仓库公开托管的论文副本，论文本身未附量表再分发许可声明。本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权（license:institutional_repository_copy / license:redistribution_review_pending）。

## 正式题目表（论文 Appendix，逐字）

TMS 的官方 administered 版以论文 **Appendix** 形式印出，含指导语、五档锚点、13 题官方编号与计分键。本条目直接采用附录编号 1–13，不做重排。

### 指导语（Appendix 逐字）

> Instructions: We are interested in what you just experienced. Below is a list of things that people sometimes experience. Please read each statement. Next to each statement are five choices: "not at all," "a little," "moderately," "quite a bit," and "very much." Please indicate the extent to which you agree with each statement. In other words, how well does the statement describe what you just experienced, just now?

### 选项锚点（Appendix 逐字）

| 分值 | 锚点 |
|---|---|
| 0 | Not at all |
| 1 | A little |
| 2 | Moderately |
| 3 | Quite a bit |
| 4 | Very much |

### 题干（Appendix 逐字，13 题；维度归属按官方计分键标注）

1. I experienced myself as separate from my changing thoughts and feelings.（D）
2. I was more concerned with being open to my experiences than controlling or changing them.（D）
3. I was curious about what I might learn about myself by taking notice of how I react to certain thoughts, feelings or sensations.（C）
4. I experienced my thoughts more as events in my mind than as a necessarily accurate reflection of the way things 'really' are.（D）
5. I was curious to see what my mind was up to from moment to moment.（C）
6. I was curious about each of the thoughts and feelings that I was having.（C）
7. I was receptive to observing unpleasant thoughts and feelings without interfering with them.（D）
8. I was more invested in just watching my experiences as they arose, than in figuring out what they could mean.（D）
9. I approached each experience by trying to accept it, no matter whether it was pleasant or unpleasant.（D）
10. I remained curious about the nature of each experience as it arose.（C）
11. I was aware of my thoughts and feelings without overidentifying with them.（D）
12. I was curious about my reactions to things.（C）
13. I was curious about what I might learn about myself by just taking notice of what my attention gets drawn to.（C）

（C=Curiosity，D=Decentering，按附录官方计分键；第 4 题引号为弯引号 'really'，照录。）

### 官方计分键（Appendix 逐字）

> Scoring:
> Key: All items were written in the positively keyed direction, so no reverse scoring of items is required.
> Curiosity score: The following items are summed: 3, 5, 6, 10, 12, 13
> Decentering score: The following items are summed: 1, 2, 4, 7, 8, 9, 11

## 计分实现

- 两维求和：Curiosity（题 3、5、6、10、12、13）范围 0–24；Decentering（题 1、2、4、7、8、9、11）范围 0–28；无反向题；两维**不合成总分**（论文按两维报告，未给出总分合成规则）。
- 与正文 Table 1 的关系：Table 1（EFA）按题池原始题号（06–42）呈现，附录按正式 administered 编号 1–13。池号→正式编号映射：36→1、33→2、32→3、35→4、26→5、06→6、37→7、34→8、42→9、39→10、40→11、17→12、41→13。第 11 题在 Table 1 印作 "without over-identifying them"、附录（正式表）印作 "without overidentifying with them"；本条目以正式 administered 版（附录）为准，差异如实记录。
- Table 1 中另有题池 29、20 两题在 CFA 中被剔除，不在 13 题内。
- 状态量表边界：TMS 测"刚刚结束的一次冥想/练习"的即时状态（指导语 "what you just experienced, just now"），不是特质正念；不与 FFMQ/KIMS/MAAS/CAMS-R 的特质分混合计分或比较，也不用于给未做练习者解释"状态基线"。
- 缺答策略：任一题缺答 → 该维度 sum 记 null（complete_required 产品保守约定，非原作者规则）。
- 不发明常模、百分位、界值或能力等级。

## 未知/待核事项

- 机构仓库副本的许可状态待审；翻译与再分发前需另行确认权利范围。
- TMS-T 特质版（Davis et al. 2009 等后续版本）为另一题本，不与本条目混用。
