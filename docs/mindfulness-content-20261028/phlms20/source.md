# PHLMS-20（Philadelphia Mindfulness Scale）源与计分记录

## 来源

- 题本来源：Cardaciotto et al. (2008) 原始论文全文（UC Berkeley Greater Good Science Center 托管副本，21 页），论文 Table 1 给出全部 20 题与官方计分注。
  - PDF 直链：https://greatergood.berkeley.edu/images/uploads/Cardaciotto-Mindfulness_on_Present_Moment_Awareness_and_Acceptance.pdf
- 工作副本 SHA-256：`ea0e7f1a2de266c593b9de4a5d54bca0acddd8337fcb5b10d747119fecedfc1c`
- 提取文本：`_prdata/pdfs/phlms_extract.txt`（pypdf，逐字底本）。
- 原始文献：Cardaciotto, L., Herbert, J. D., Forman, E. M., Moitra, E., & Farrow, V. (2008). The assessment of present-moment awareness and acceptance: The Philadelphia Mindfulness Scale. *Assessment*, 15(2), 204–223. DOI: 10.1177/1073191107311467（经 Crossref 核对；DOI 为标准出版记录信息，PDF 未印 DOI）。
- 许可说明（如实记录）：期刊论文为 SAGE 付费墙内容（PDF 页脚印 "© 2008 SAGE Publications. All rights reserved. Not for commercial use or unauthorized distribution."，系某大学个人使用下载副本）；本副本为 GGSC 公开托管。本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权（license:source_hosted_pdf / license:redistribution_review_pending）。论文注明 "A copy of the PHLMS can be obtained from the authors"。

## 官方计分注（Table 1 NOTE，逐字）

> NOTE: All items are rated on a 5-point Likert-type scale (1 = never, 2 = rarely, 3 = sometimes, 4 = often, and 5 = very often) according to the frequency each item was experienced over the past week. To obtain the Awareness subscale score, all odd items are totaled; higher scores reflect higher levels of awareness. To obtain the Acceptance subscale score, all even items are reverse scored and totaled; higher scores reflect higher levels of acceptance. A copy of the PHLMS can be obtained from the authors.

## ⚠️ 锚点口径冲突（如实记录）

- Table 1 计分注：**1 = never, 2 = rarely, 3 = sometimes, 4 = often, 5 = very often**（1–5，过去一周频次）。
- Study 2 实施描述（论文正文）： participants rated items on a 5-point Likert-type scale (**0 = never, 1 = rarely, 2 = sometimes, 3 = often, and 4 = very often**)——0–4。
- 两处为同一论文内的不一致；Table 1 注是论文对成量表给出的官方计分方向，且后续独立验证（如 Klein, 2015 对 TMS 与 PHLMS 的比较）也按 1–5 描述。本条目采用 **Table 1 注的 1–5 口径**并在此如实记录冲突；若取得作者原版施测表，以原版为准。

## 题干（Table 1，逐字，20 题）

题号与 Table 1 一致；奇数题为 Awareness（觉察），偶数题为 Acceptance（接纳，表述为不接纳方向，官方计分反向）。

1. I am aware of what thoughts are passing through my mind.
2. I try to distract myself when I feel unpleasant emotions.
3. When talking with other people, I am aware of their facial and body expressions.
4. There are aspects of myself I don’t want to think about.
5. When I shower, I am aware of how the water is running over my body.
6. I try to stay busy to keep thoughts or feelings from coming to mind.
7. When I am startled, I notice what is going on inside my body.
8. I wish I could control my emotions more easily.
9. When I walk outside, I am aware of smells or how the air feels against my face.
10. I tell myself that I shouldn’t have certain thoughts.
11. When someone asks how I am feeling, I can identify my emotions easily.
12. There are things I try not to think about.
13. I am aware of thoughts I’m having when my mood changes.
14. I tell myself that I shouldn’t feel sad.
15. I notice changes inside my body, like my heart beating faster or my muscles getting tense.
16. If there is something I don’t want to think about, I’ll try many things to get it out of my mind.
17. Whenever my emotions change, I am conscious of them immediately.
18. I try to put my problems out of mind.
19. When talking with other people, I am aware of the emotions I am experiencing.
20. When I have a bad memory, I try to distract myself to make it go away.

（撇号均为原文弯撇号 U+2019，照录。）

## 计分实现

- 两维：**Awareness（觉察）= 奇数题 1,3,5,7,9,11,13,15,17,19 直接求和**，范围 10–50；**Acceptance（接纳）= 偶数题 2,4,6,8,10,12,14,16,18,20 反向（6−response）后求和**，范围 10–50。
- 两维**不合成总分**：原论文 CFA 中 Awareness 与 Acceptance 相关不显著（r = –.02），官方计分注只给两维、未定义总分。
- 时间框：过去一周的频次自评。
- 缺答策略：任一题缺答 → 该维度 sum 记 null（complete_required 产品保守约定，非原作者规则）。不发明常模、百分位、界值或能力等级。
- 与本分支其他正念工具（FFMQ/KIMS/MAAS/TMS/CAMS-R/CAMM）题本、结构与证据互不通用，分数不互换比较。

## 未知/待核事项

- 锚点 1–5 vs 0–4 的论文内冲突已记录；作者原版施测表未取得。
- SAGE 付费墙论文的机构托管副本许可待审。
