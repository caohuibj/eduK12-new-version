# JD-R approved Chinese wording — source catalog only, 2026-10-30

User explicitly approved all previous 208 Chinese item wordings and asked for intake. These four approved Simplified Chinese instrument sets are source identifiers and **private DRAFT development candidate references**, not executable public questionnaires. No original/translated third-party questionnaire text is copied into Git.

| Identity and private SHA256 | C/S/P/R | Status and source |
|---|---|---|
| `tses24_2024_zh_cn@1.0.0` / `e2261a76883ad7cf61b8d2e41b264b870dc6109dbcfbd13da0f47519133e2baf` | Private C/S1.0.0, Pnone, R1.0.0 | CATALOG_ONLY public; https://bpb-us-w2.wpmucdn.com/u.osu.edu/dist/2/5604/files/2024/07/TSES-Forms-2024.pdf |
| `tses12_2024_zh_cn@1.0.0` / `271a95ae49a7b3e8d0135ff3b94221145528dd3026e9e4831bc07be6dc54c936` | Private C/S1.0.0, Pnone, R1.0.0 | CATALOG_ONLY public; https://bpb-us-w2.wpmucdn.com/u.osu.edu/dist/2/5604/files/2024/07/TSES-Forms-2024.pdf |
| `uwes9_2004_zh_cn@1.0.0` / `ac689e07a0ff260f4b1a094333df51ec68a179a47f4ffdfc1fa1411256686cc5` | Private C/S1.0.0, Pnone, R1.0.0 | CATALOG_ONLY public; https://www.wilmarschaufeli.nl/publications/Schaufeli/Test%20Manuals/Test_manual_UWES_English.pdf |
| `bat_secondary10_zh_hans@1.0.0` existing canonical / private source `36d38939ab47b571575707205ddd144ed475517776253d20dbdc7eed8738456c` | Private C/S1.0.0, Pnone, R1.0.0 | Existing catalogManifestVersion 1→2 only; no duplicate. User-approved source key is a private alias requiring canonical reconciliation. |

No detailed scoring/diagnostics or question source text is in this Git PR. Private draft scoring: TSES 2024 original 3-factor 24/12 keys, UWES9 author original overall 9 and 3x3 0–6 source means, BAT-S original 10-item 1–5 mean. Project conservative `complete_required` is explicitly not an author missing rule. No China K12 thresholds or personal diagnostics.

**Retained blockers**: TSES author academic permission is not public Git/commercial instrument redistribution; UWES author academic/data sharing not accepted; BAT official Chinese direct extracted electronic form redistribution not established; the BAT work Chinese core item9 conflict remains unrelated and unresolved. Text editorial acceptance is neither content-publication license nor specialist psychometric validation. All real scorer/report CI for the private source files, DB installation, PUBLIC, grant, task launch and deployment are NOT_RUN.

Current repo workflow 1.0.0, proposed CI-DESIGN0.1.0 is only design; actual pure declarative content uses the present main CI `scale_intake_light`, exact current head/required merge gate. This catalog PR does not modify checker/CI, runtime, database or user permissions.
