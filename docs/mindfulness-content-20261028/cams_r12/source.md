# CAMS-R（Cognitive and Affective Mindfulness Scale–Revised）源与计分记录

## 来源

- 题本 PDF：UC Berkeley Greater Good Science Center（GGSC）官方量表页托管的 12 题版本（1 页）。
  - PDF 直链：https://ggsc.berkeley.edu/images/uploads/The_Cognitive_and_Affective_Mindfulness_Scale_%E2%80%93_Revised.pdf
  - 量表索引页：https://ggsc.berkeley.edu/who_we_serve/researchers/scientific_scales_and_measures
- 工作副本 SHA-256：`b9f7a26e8747cd2ef50ea9d53fa041884e0e481a2a49ae567ed857d90c70a53d`（192,626 字节，1 页）。
- 提取文本：`_prdata/pdfs/cams_r_extract.txt`（pypdf，逐字底本）。
- 原始文献（PDF 页脚印出）：Feldman, G., Hayes, A., Kumar, S. et al. J Psychopathol Behav Assess (2007) 29: 177. doi:10.1007/s10862-006-9035-8；经 Crossref 核对的标准记录：Feldman, G., Hayes, A., Kumar, S. M., Greeson, J. M., & Laurenceau, J.-P. (2007). Mindfulness and Emotion Regulation: The Development and Initial Validation of the Cognitive and Affective Mindfulness Scale-Revised (CAMS-R). *Journal of Psychopathology and Behavioral Assessment, 29*(3), 177–190（PDF 印的 "29: 177" 为起始页）。
- 许可说明（如实记录）：GGSC 量表索引页公开托管该题本 PDF；页面与 PDF 均未附明确的使用/再分发许可声明。本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权（license:source_hosted_pdf / license:redistribution_review_pending）。

## 指导语（逐字）

> Instructions: People have a variety of ways of relating to their thoughts and feelings. For each of the items below, rate how much each of these ways applies to you.

## 题干（逐字，12 题）

题号与 PDF 一致；保留原文弯撇号。

1. It is easy for me to concentrate on what I am doing.
2. I am preoccupied by the future.
3. I can tolerate emotional pain.
4. I can accept things I cannot change.
5. I can usually describe how I feel at the moment in considerable detail.
6. I am easily distracted.
7. I am preoccupied by the past.
8. It's easy for me to keep track of my thoughts and feelings.
9. I try to notice my thoughts without judging them.
10. I am able to accept the thoughts and feelings I have.
11. I am able to focus on the present moment.
12. I am able to pay close attention to one thing for a long period of time.

## 计分（PDF 逐字 + 锚点来源说明）

PDF 计分说明逐字：

> Scoring: Items 2, 6, and 7 are reverse-scored. After appropriate reversals, sum values for items 1 - 12. Higher values reflect greater mindful qualities.

### 选项锚点（关键验证点，如实记录）

GGSC 题本 PDF **未印各级选项的文字锚点**（这正是该工具此前登记为候选的原因）。本次核得的可验证出处：

- 开放获取文献对 CAMS-R 作答方式的描述（Front Psychol 2026，Europe PMC PMC13059079，OA 全文逐字）："The items are rated on a 4-point scale: rarely/not at all, sometimes, often, and almost always."
- 另两篇 OA/可访问文献一致描述为 4 点量表（1 = rarely/not at all … 4 = almost always）：PMC13370295（Palliat Support Care 2026）"Items were rated on a 4-point scale (1 = rarely/not at all; 4 = almost always)"；PMC10779681（J Clin Med 2023）"respondents self-report their responses to the 12 items using a 4-point Likert scale (ranging from rarely/not at all to almost always)"。
- 结论：本条目采用 4 点锚点 1=rarely/not at all、2=sometimes、3=often、4=almost always；与 12 题、反向题 2/6/7、求和计分完全自洽（总分 12–48，均值 1–4）。**该锚点文字出自同行评审 OA 文献的描述，而非原作者题本原件**——GGSC 官方托管表未印锚点；此差异如实记录，若日后取得作者原版表，以原版为准。

## 计分实现

- 单维总分：反向 2/6/7（公式 5−response，1–4 量表镜像翻转）后求和 1–12 题，范围 12–48；均值（1–4）同时给出。
- 缺答策略：任一题缺答 → 总分 null（complete_required 产品保守约定，非原作者规则）。
- 不发明常模、百分位、界值或能力等级。CAMS-R 为特质正念的单维总分工具，不拆分子维度（文献中的四方面描述是内容主题，不是官方分维度计分）。

## 未知/待核事项

- 原作者（Feldman 等）题本原件的锚点文字未直接取得；当前锚点为 OA 文献佐证。
- GGSC 页面未附许可声明；翻译与再分发前需另行确认权利范围。
