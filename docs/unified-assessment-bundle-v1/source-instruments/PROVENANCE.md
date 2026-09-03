# Source instrument provenance — Unified Assessment Bundle v1

User confirmed **electronic administration is authorized** for these attached official source PDFs (2026-09-02).

| File | Instrument | Form / version | Language | Product use |
|---|---|---|---|---|
| `sdq-parent-zh-hans.pdf` | SDQ Strengths and Difficulties Questionnaire © Robert Goodman, 2005 | Parent/teacher Chinese one-page 25-item form (no impact page in this PDF) | zh-Hans | Primary source for `sdq_parent_zh_cn` / `sdq_parent_observer_zh_cn_v1` |
| `sdq-teacher-t4-10-en.pdf` | SDQ | **T 4-10** teacher form (25 items + impact supplement) | English | Official English source locked for `sdq_teacher_zh_cn` teacher package; zh-CN translation pending signed manifest |
| `sdq-student-s11-17-zh-hant.pdf` | SDQ | **S 11-17** student self-report | zh-Hant | Provenance only — first-party product list is parent/teacher observers, not student self |
| `texi-or-adexi-related.pdf` | TEXI Teenage Executive Functioning Inventory | Parents and Teachers, 20 items, Likert 1–5 | English | Official English source for `texi_parent_zh_cn` / `texi_teacher_zh_cn`; zh-CN localization pending signed manifest |

Extracted text: `*.pdftotext.txt` via `pdftotext -layout`.

## Scoring literature (not invented)

### SDQ
- Item→subscale mapping, reverse-keyed items (7, 11, 14, 21, 25), 0/1/2 scoring, total difficulties = emotional+conduct+hyperactivity+peer (exclude prosocial): Goodman scoring instructions for ages 4–17 (sdqinfo.org / Project TEACH NY SDQ_4scoring reprint of Goodman materials).
- Four-band UK community cut-points (parent vs teacher differ): Goodman newer 4-band categorisation for 4–17 (close to average / slightly raised / high / very high). **Cited descriptively only — not validated mainland CN clinical norms.**
- Impact scoring (teacher T4-10): distress + peer relations + classroom learning; Not at all/Only a little=0, A medium amount=1, A great deal=2; chronicity/burden excluded (Goodman 1999 impact supplement). Parent PDF in this set has no impact page → parent package does not claim impact score.

### TEXI
- Thorell et al. (2020), *Child Neuropsychology*, PMID 32090688 — ages 13–19; two factors Working Memory + Inhibition; free instrument at chexi.se.
- Subscale item map (aligned with published factor structure / ADEXI family coding): WM items 1,2,5,7,8,9,11,12,13; Inhibition items 3,4,6,10,14–20. Scores = **mean** of completed subscale items (paper reports subscale means). Descriptive only; **no mainland norms**.
- English item wording cross-checked against chexi.se official parent/teacher PDF where attached PDF OCR mixed self-report bleed into items 9–10.

## Authorization
SDQ electronic administration + scoring must bind Commit 9.1 durable APPROVED (or EVIDENCE_PENDING warn-only) InstrumentAuthorization with `electronicAdministration` and `scoring` in scope.
