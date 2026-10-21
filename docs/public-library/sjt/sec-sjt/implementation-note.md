# SEC-SJT V2 DRAFT implementation

The explicit implementation instruction supersedes the pre-19:25 read-only suggestion that formal items be UI-required. This draft uses formal SCORED required:false. It is source-only DRAFT, not published or a validated Chinese instrument.

## Frozen scope and semantics

- sec-sjt-zh-hans/1.0.0: instrument.json, publication.json, scientific.json; required generated manifest; one independent SEC-SJT contract probe; this note and evidence.
- Fixed NEXT chain: original independent practice, all10 formal items, terminal. No sampling, ranking or alternate route.
- Practice: original5 options, RAW_ONLY required:true, no key, contribution, metric or correctness feedback. Requiring one practice choice is a platform interaction guard, not a newly claimed author scoring rule.
- Formal10: SCORED required:false. UI “可选” means one may leave it blank, not that a partial score is allowed. Explicit platform notice: “可以留空或退出；任一正式题缺答，本次不计算总分”. The complete ten-key index remains in the scoring projection, so any missing formal response yields the single metric null. No imputation, prorating or missing-as-wrong scoring.
- Exact original formal key retained:3,4,2,1,4,3,3,3,2,3. Valid matched choices score1; other valid choices score0. One AUTHOR_KEY_SUM metric with descriptive direction and range0–10; no narrative-only hiding, subscales, norms or cutoffs.
- Original instruction translation appears before practice. Original post-practice text appears before item1. Original paper wording “2 questions per page” is retained as source wording, alongside explicit digital one-item-per-page adaptation. No claim of identical administration. All formal/practice options preserve frozen Chinese working text. No instrument hard time limit added; breaks permitted, without promising indefinite platform/session retention.

## Scientific and licensing boundaries

Original intended group: ages15;0–24;11 with (sub)clinical cognitive or psychological impairments, especially learning-disability support/vocational preparation, not ordinary youth in general. Convenience N306, alpha.65; no Chinese validation or K12 norms. Only raw key-match count is described, not health, clinical diagnosis, morality, general real-life competence or selection suitability.

Original authors Daniel Wolf, Sarah Schneider, Astrid Schütz (2020), University of Bamberg; https://doi.org/10.20378/irb-48863 . Original manual explicitly licenses manual/materials/scoring file CC BY-SA4.0. Selected source material, AI-assisted Chinese working translation and digital adaptation retain https://creativecommons.org/licenses/by-sa/4.0/ attribution/change notices. Repository MIT does not override this content license. Source metadata carries attribution/license notices, and frozen docs retain full provenance and original disclaimers. No author endorsement or human bilingual/scientific approval is claimed. Scientific PILOT with empty platform execution-bound evidence is not a denial of original research.

## Bounded checks

One SEC-SJT-only probe run passed: actual source schema and V2 package validator, all5 practice responses leave formal score10 unchanged, exact10 item/50 key map, full10/0/mixed5, each of10 formal omissions and all formal missing→null, optional trajectory reaches terminal, missing practice does not, invalid options/numeric/unknown/duplicate responses reject, practice excluded from scoring projection, report SSR raw0–10 and null with boundary text, real published selector rejects DRAFT. No old instrument checks rerun.

One additional focused assertion checked the exact FINAL scorer calling convention: after upstream validation it receives the full raw response list including practice with responsesValidated:true. It still produces10 with only10 formal contributions and no practice response in metric coverage. This focused assertion was then retained in the standalone probe; the full probe was not rerun. No full FINAL service/DB transaction or browser acceptance was claimed. SSR is component evidence, not production deployment.

Node24.21.0 and existing read-only scales dependency trees were reused via esbuild; new bundles were placed only in /tmp. No shared runtime/permission/dependency changes, no CI, commit, push or merge. The source remains DRAFT; publishing requires separate authorization and scientific/product review.
