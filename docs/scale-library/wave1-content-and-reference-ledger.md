# 第一波量表：内容与参考验收

六个量表家族 × 六个学科，共 36 个学生自评版本。数学/化学的 10 个精确历史版本为项目范围 RESEARCH_READY；其它 26 个为 PILOT。PUBLISHED 是内容可发布状态，不表示科研成熟度。

Value–Cost 含独立 Value（1–3）与 Cost（4–7），不生成总分。补习必要性为项目自编 T2/T3 版本；Bray 仅为概念背景。Teacher Subject Liking 测学生感知，不判定教师真实态度。数学 Cost 保留时间代价交叉负荷局限及 LOCAL_PILOT 参考成熟度。

## 经验参考审计

原始数据 SHA256：`473c7b0c7ac4c8778405e388cbad90d4cf13ef223b49c7b22fd78ef29c480dbd`。Item Map SHA256：`b4657775dca655b7f8f01234a6e5047cb5f0f3af710f1df41a21f37fa95cc182`。仓库只包含题目与聚合证据，不包含个人原始数据。

LATEST_VALID_COMPATIBLE_WAVE_PER_CANONICAL_PERSON_AND_SCORE

| family/subject/score/stage | N | bands | band counts | alpha (complete N) |
|---|---:|---:|---|---|
| academic_self_concept/chemistry/academic_self_concept/junior_secondary | 736 | 5 | 66, 136, 331, 131, 72 | 0.9099 (732) |
| academic_self_concept/chemistry/academic_self_concept/upper_secondary | 702 | 3 | 236, 258, 208 | 0.9131 (702) |
| academic_self_concept/mathematics/academic_self_concept/junior_secondary | 735 | 5 | 74, 138, 300, 151, 72 | 0.9287 (735) |
| academic_self_concept/mathematics/academic_self_concept/upper_secondary | 702 | 5 | 107, 98, 249, 172, 76 | 0.9244 (702) |
| domain_fixed_mindset/chemistry/domain_fixed_mindset/junior_secondary | 737 | 5 | 94, 76, 368, 129, 70 | 0.8105 (723) |
| domain_fixed_mindset/chemistry/domain_fixed_mindset/upper_secondary | 702 | 5 | 131, 38, 322, 145, 66 | 0.8652 (702) |
| domain_fixed_mindset/mathematics/domain_fixed_mindset/junior_secondary | 737 | 5 | 111, 176, 239, 129, 82 | 0.9000 (730) |
| domain_fixed_mindset/mathematics/domain_fixed_mindset/upper_secondary | 702 | 5 | 89, 108, 292, 124, 89 | 0.9251 (702) |
| value_cost/chemistry/value/junior_secondary | 737 | 5 | 66, 130, 300, 82, 159 | 0.8982 (732) |
| value_cost/chemistry/value/upper_secondary | 702 | 5 | 98, 93, 312, 128, 71 | 0.9311 (702) |
| value_cost/chemistry/cost/junior_secondary | 737 | 5 | 80, 178, 260, 145, 74 | 0.8298 (725) |
| value_cost/chemistry/cost/upper_secondary | 702 | 5 | 76, 139, 270, 157, 60 | 0.8277 (702) |
| value_cost/mathematics/value/junior_secondary | 737 | 3 | 205, 248, 284 | 0.9137 (728) |
| value_cost/mathematics/value/upper_secondary | 702 | 4 | 139, 163, 189, 211 | 0.9311 (702) |
| value_cost/mathematics/cost/junior_secondary | 737 | 5 | 74, 142, 326, 129, 66 | 0.7975 (728) |
| value_cost/mathematics/cost/upper_secondary | 702 | 5 | 72, 165, 235, 166, 64 | 0.7881 (702) |
| tutoring_necessity/chemistry/tutoring_necessity/junior_secondary | 736 | 5 | 70, 124, 317, 160, 65 | 0.8099 (732) |
| tutoring_necessity/chemistry/tutoring_necessity/upper_secondary | 702 | 5 | 140, 110, 223, 174, 55 | 0.8704 (702) |
| tutoring_necessity/mathematics/tutoring_necessity/junior_secondary | 736 | 5 | 72, 125, 336, 132, 71 | 0.8721 (732) |
| tutoring_necessity/mathematics/tutoring_necessity/upper_secondary | 702 | 5 | 72, 129, 323, 129, 49 | 0.8799 (702) |
| academic_self_efficacy/chemistry/academic_self_efficacy/junior_secondary | 480 | 5 | 57, 70, 188, 119, 46 | 0.8681 (474) |
| academic_self_efficacy/chemistry/academic_self_efficacy/upper_secondary | 571 | 5 | 56, 112, 234, 120, 49 | 0.8889 (569) |
| teacher_subject_liking/chemistry/teacher_subject_liking/junior_secondary | 366 | 4 | 78, 89, 83, 116 | 0.9132 (359) |
| teacher_subject_liking/chemistry/teacher_subject_liking/upper_secondary | 560 | 4 | 101, 162, 165, 132 | 0.9172 (558) |

## 保守的产品选择

初中（7–9）、高中（10–12）分别选参考。没有年级上下文时展示通用解释，不冒用分档或百分位。新学科仅替换学科语义，不推定测量等值。计分版本不同不自动兼容；需新精确版本与显式兼容审查。报告版本与后续参考选择、原始单次参考身份一并冻结。

参考更新只提出人工审查候选，不自动 ACTIVE：样本增幅达到 25%、新增学校/学段、每学期例行审查、分布漂移、地板/天花板或分档比例明显变化，都应复核覆盖、缺失、可靠性与各亚组后新建 DRAFT。本轮无运行时自动校准任务。

安装必须通过系统管理员、真实授权记录及正常发布门。测试库授权明确标记 TEST ONLY，不构成生产授权。家长/教师独立文本尚未编写，本轮不会把学生解释转发成人；数值投影继续依照已有权限与披露合同。

## 再生成与验收

作者工具读取本地已批准只读原始材料，执行 `generate-learning-motivation-reference.py` → `generate-packages.py` → `finalize-scope.ts` → `scale:instruments:check`。运行参数见工具说明。绝不把原始数据纳入 Git。

自动验收覆盖全包 golden、缺失作答门限、跨学科/年级错配、伪经验声明、缺少受众 QC、版本不升档、冻结哈希及快照不可更新/删除、权限拒绝、36 个内容安装/发布/重复安装、纵向 v1/v2/v3 冻结与显式重生成。

前端验收覆盖可读段落、得分位置和服务端冻结趋势。自动字数/关键词不能证明学生读懂，仍需后续学生试读。

## Revision audit (2026-10-01)
Calibration now records eligibleN and attributes each person's missingness denominator to the selected valid wave's stage (or the latest eligible stage if no valid score exists). Recomputed all 24 references from the read-only canonical inputs: N, bands and missingness values were unchanged; three synthetic generator contracts cover the cross-stage fallback and unsupported distributions.

Student report examples now follow each construct: subject understanding for self-concept/efficacy, observed classroom behaviour for teacher interest, and separate value, time-cost and support-choice situations. Student-facing Value/Cost jargon was replaced with Chinese wording. Refreshed the 35-band review document from registered source content.
