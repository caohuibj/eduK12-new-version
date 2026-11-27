# Catalog-only scale review batch 01 (2026-11-27)

Base: `origin/main@5c0585a1`  
Scope: first 20 entries in the 162-entry catalog-only queue  
Runtime changes: none  
CI: not activated

This batch keeps source identity separate from executable readiness. A public
paper or downloadable questionnaire is not treated as permission to alter the
instrument, redistribute an adaptation, or invent missing response/scoring
rules. None of these 20 entries is a synthetic load-test instrument.

## Review outcome

- 0/20 are currently production-executable.
- Three have a relatively short intake path: `bat12_general_en`,
  `bat22_general_en`, and `cid_dua3_2026_teacher_self_en`.
- APQ42 has an open executable candidate in PR #379, but its independent
  Simplified Chinese translation and electronic/public redistribution rights
  are not closed.
- The Simplified Chinese BAT files contain version/semantic conflicts that the
  platform must not silently edit while retaining the official BAT identity.
- C-ETS does not publish the complete 14-item Traditional Chinese form or a
  complete individual scoring protocol.
- The ten COPSOQ records are five English/Chinese source pairs. They remain
  subject to national/language version coordination and cannot be converted
  from a Chinese health-worker validation into K-12 teacher norms.

## Per-version records

| # | Version | Outcome | Main blocker | Review document |
|---:|---|---|---|---|
| 1 | `apq42_parent_global_zh_cn_research@1.0.1` | catalog only | translation/electronic/public redistribution rights; executable C/S/P/R not in main | [Doc](https://docs.google.com/document/d/1s7ChleianVu4LbF_FLTiwgl6IQCB3cJVOWjPGaz5Wlk/edit) |
| 2 | `bat_secondary10_zh_hans@1.0.0` | catalog only | canonical-key reconciliation; redistribution; scoring/report | [Doc](https://docs.google.com/document/d/16XPjbPMzrhK9_kMzb9FL-ADToMvj8mXmuD7aSM1oXEY/edit) |
| 3 | `bat12_general_en@1.0.0` | conditionally intake-ready | electronic/public repository terms; scoring protocol | [Doc](https://docs.google.com/document/d/1TYaHwrY-jXA4USpEztpKMH5zox0Pl8oG80NjOZjNePQ/edit) |
| 4 | `bat12_general_zh_hans@1.0.0` | blocked | item 9 meaning and short-form selection mismatch | [Doc](https://docs.google.com/document/d/12QiNPo93xo6BunRbjhaS_hszH254L2LCC4OUn2p71qY/edit) |
| 5 | `bat12_work_zh_hans@1.0.0` | blocked | official Chinese/English item 9 direction conflict | [Doc](https://docs.google.com/document/d/1-nBXfp5IEM5EcaIgHyKuam7S1APMZjY67Q6r6uQSrUE/edit) |
| 6 | `bat22_general_en@1.0.0` | conditionally intake-ready | electronic/public repository terms; general-version scoring | [Doc](https://docs.google.com/document/d/1SiVVVvXvUFDa3I35azsIIEKYuEijnXRY2Mj7XZgaHGY/edit) |
| 7 | `bat22_general_zh_hans@1.0.0` | blocked | residual work wording and item 9 conflict | [Doc](https://docs.google.com/document/d/15l_hTKNF6lvyXYeq0hjruKr-PrVbUiBYbSrip4QXpwE/edit) |
| 8 | `bat23_work_zh_hans@1.0.0` | blocked | official Chinese item 9 direction conflict | [Doc](https://docs.google.com/document/d/1rmM3GI5yoRSeeZ8IS09OxT0nS53KCqZFssf6xrSiHlY/edit) |
| 9 | `c_ets14_zh_hant@1.0.0` | catalog only | full Chinese form, original ETS rights, scoring protocol | [Doc](https://docs.google.com/document/d/18B7Nhy5MZb9Wozgmg7DPZgeHCD4Lclgk2F_xHpqZ4Sw/edit) |
| 10 | `cid_dua3_2026_teacher_self_en@1.0.0` | content available; scoring blocked | teacher response anchors/coding/missing rules | [Doc](https://docs.google.com/document/d/1ekamSTkMxzsLSX2UoEjC-a5AgtL3uSJjIXi2IM3r-tc/edit) |
| 11 | `copsoq3_bo_en@1.0.0` | catalog only | national-version coordination and executable protocol | [Doc](https://docs.google.com/document/d/1x1xKcgfkcCza_iBB4YjM6ej7NV_IRBAffrCWuUYKIKw/edit) |
| 12 | `copsoq3_bo_zh_cn@1.0.0` | catalog only | health-worker population, national version, scoring | [Doc](https://docs.google.com/document/d/1Q2miJ0nAsz6Kx-gPgCaYcxdzgQSmUI36JMjsn7r7RsE/edit) |
| 13 | `copsoq3_bu_en@1.0.0` | catalog only | non-scalar exposure categories; national version | [Doc](https://docs.google.com/document/d/1YidIeLFA9Q1-8N3O-0o32YanuVdKdwKwGRaTm5eOsy0/edit) |
| 14 | `copsoq3_bu_zh_cn@1.0.0` | catalog only | 2/3 cross-version conflicts; special categories | [Doc](https://docs.google.com/document/d/1l_5PdZu90P4rXOodu67vPiK3JoyfkW6kYfNBs-AERnk/edit) |
| 15 | `copsoq3_cd_en@1.0.0` | catalog only | national version; item/response/scoring not installed | [Doc](https://docs.google.com/document/d/1I3sn5kPQ9XapoThrTk65NnkJEoB8zSGZHC5j478wTAM/edit) |
| 16 | `copsoq3_cd_zh_cn@1.0.0` | catalog only | health-worker evidence cannot become teacher norms | [Doc](https://docs.google.com/document/d/1Nin3Jr5kiWk0DJ3txyvHIVtSUDd5IuxF2d6leo9waYI/edit) |
| 17 | `copsoq3_cl_en@1.0.0` | catalog only | CORE alignment and national-version decision | [Doc](https://docs.google.com/document/d/1nYfU5qrayskv_dXm0zraSUpePxpzIJaOaCXUteRJjPo/edit) |
| 18 | `copsoq3_cl_zh_cn@1.0.0` | catalog only | 3/3 cross-version conflicts; teacher applicability | [Doc](https://docs.google.com/document/d/1p-W-6nQQejqOb0jaP2c1DpALm1oyLoP0JVK_-ButiXs/edit) |
| 19 | `copsoq3_co_en@1.0.0` | catalog only | CO2/CO3 semantic alignment; national version | [Doc](https://docs.google.com/document/d/1nX-7uoX72SrArQhVY4Us0dm8p3qCd3F5-S2NIg1b-HQ/edit) |
| 20 | `copsoq3_co_zh_cn@1.0.0` | catalog only | 2/2 cross-version conflicts; population transfer | [Doc](https://docs.google.com/document/d/1fi6i_lGaScNxe2C4NGecWt-s0EgxK6YJ8olnlQALv2c/edit) |

## Primary sources used

- [APQ official steward page](https://faculty.lsu.edu/pfricklab/alabamaparenting.php)
- [BAT official use statement](https://burnoutassessmenttool.be/start_eng/)
- [BAT official questionnaire page](https://burnoutassessmenttool.be/handleiding_vragenlijst_eng/)
- [C-ETS original study](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.676835/full)
- [CID-DUA3 original study](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1921354/full)
- [COPSOQ licence, guidelines and questionnaire](https://www.copsoq-network.org/licence-guidelines-and-questionnaire)
- [COPSOQ III China health-worker preliminary validation](https://www.mdpi.com/2227-9032/13/7/825)

No protected item set was copied into this review. No sample statistic was
promoted to an individual threshold, and no catalog record was represented as
an executable or published instrument.
