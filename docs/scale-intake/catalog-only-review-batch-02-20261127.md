# Catalog-only scale review batch 02 (2026-11-27)

Base: `origin/main@5c0585a1`  
Scope: entries 21–40 in the 162-entry catalog-only queue  
Runtime changes: none  
CI: not activated

This batch reviews ten COPSOQ III dimensions as English international and
Chinese healthcare-source pairs. Source identity, questionnaire level,
response-code semantics, national/language coordination, scoring, thresholds,
teacher applicability and duplicate relationships were checked separately.
No protected item wording is reproduced here.

## Review outcome

- All 20 records have a real COPSOQ III source identity; none is a synthetic
  development or load-test instrument.
- 0/20 are currently production-executable. Each directory contains only a
  catalog `source.json` and export shell, not a complete C/S/P/R combination.
- The English and Chinese ED records are conditional intake candidates because
  the international structure is clear, includes two CORE items, and the
  current inventory records no row-level semantic conflict in the three-item
  Chinese source. Formal China coordination, executable terms, scoring,
  missing-data rules, teacher applicability and reporting remain open.
- The other 18 records remain catalog-only or blocked. The 2025 evidence is a
  preliminary healthcare-worker validation and cannot be promoted to a K-12
  teacher norm.
- No response category, sample mean, factor loading or deletion statistic was
  converted into a threshold or executable score.

## Per-version records

| # | Version | Outcome | Main blocker | Review document |
|---:|---|---|---|---|
| 21 | `copsoq3_cq_en@1.0.0` | catalog only | categorical exposure; China coordination and executable protocol | [Doc](https://docs.google.com/document/d/1K57mZszL6luj1FtUcR_zqgcVbENwBT_rCjFsBGmZh6Q/edit) |
| 22 | `copsoq3_cq_zh_cn@1.0.0` | blocked | 1/1 cross-version review; medical sample is not a teacher version | [Doc](https://docs.google.com/document/d/1H0901UvYoSiVN2pvvHqQ9ea9xMuqcNG-Hz5II2dIWMk/edit) |
| 23 | `copsoq3_cs_en@1.0.0` | catalog only | national version, missing-data rule, teacher reference and non-diagnostic report | [Doc](https://docs.google.com/document/d/1os9XJxu3Zw5VqrMHslQPC4tHJ5tpPMtLDxGUGXUnk6E/edit) |
| 24 | `copsoq3_cs_zh_cn@1.0.0` | blocked | 4/4 source alignment review and unresolved item trimming | [Doc](https://docs.google.com/document/d/1C0XWhctqJxIrwxXNm0NQl8WdmplLhGxc0m5E36PMkVw/edit) |
| 25 | `copsoq3_ct_en@1.0.0` | catalog only | five-versus-four item selection and reverse scoring | [Doc](https://docs.google.com/document/d/17MQHKHnQIo1lne0Y5MOTH0RXtsVq_Tpak16MSkHmq6E/edit) |
| 26 | `copsoq3_ct_zh_cn@1.0.0` | blocked | catalog has five items while revised study removes CT5 | [Doc](https://docs.google.com/document/d/1togwAbZUp393wpi4exyilYe56phM6Vfw7q61xQBeasE/edit) |
| 27 | `copsoq3_cw_en@1.0.0` | catalog only | final China key, reverse scoring and non-accountability report | [Doc](https://docs.google.com/document/d/1AIiev89YifumEsq05ysODr7hcRYEfWpHBbp-vYEWd50/edit) |
| 28 | `copsoq3_cw_zh_cn@1.0.0` | blocked | paper conflicts between CW4 and CW5 deletion references | [Doc](https://docs.google.com/document/d/1y_rIQ5lHucBPGqvXeYMqrTWfyPa7xrQXj-xKhrkOyfI/edit) |
| 29 | `copsoq3_ds_en@1.0.0` | catalog only | national version and non-diagnostic safety boundary | [Doc](https://docs.google.com/document/d/12iYz56mkU-o2R1Ah46nKBfJuYNzJhpaPnt7lJ80CkH4/edit) |
| 30 | `copsoq3_ds_zh_cn@1.0.0` | blocked | 4/4 alignment review and unresolved item trimming | [Doc](https://docs.google.com/document/d/1s2Hakb2zR5TB36eaiGmmr5e4A83-aPdJq15HBLhoziQ/edit) |
| 31 | `copsoq3_emotional_demands_en@1.0.0` | conditional intake candidate | two CORE items; coordination, executable scoring and teacher report pending | [Doc](https://docs.google.com/document/d/1Tl319dwgsTF5HgHc3xafzxvKPMXLL41nm-l9hGUOLN8/edit) |
| 32 | `copsoq3_emotional_demands_zh_cn@1.0.0` | conditional intake candidate | 0/3 row conflicts, but formal Chinese version and teacher evidence pending | [Doc](https://docs.google.com/document/d/1MA4jH2bET-YXBxQ-aI2jdXVih-8cGPssvOg0ANk7c5Y/edit) |
| 33 | `copsoq3_gh_en@1.0.0` | catalog only | CORE/LONG selection and distinct response formats | [Doc](https://docs.google.com/document/d/1-73OCc7SHIee4MsMjScDYA2m7D8avNiyv4UfbYyUPRo/edit) |
| 34 | `copsoq3_gh_zh_cn@1.0.0` | blocked | 2/2 alignment review; China EFA removed the dimension | [Doc](https://docs.google.com/document/d/19phOMCKlD7WXDEpNFomAJYExEeUSOBJ57dn46FfFH9w/edit) |
| 35 | `copsoq3_gs_en@1.0.0` | catalog only | conditional multi-select, privacy and country coordination | [Doc](https://docs.google.com/document/d/1mZJYdiqVmFvYNRbk8RDCXQEoZS7ZXJMjRsuLLSw8TIo/edit) |
| 36 | `copsoq3_gs_zh_cn@1.0.0` | blocked | 2/2 alignment review and sensitive-event protocol | [Doc](https://docs.google.com/document/d/1O5Mi7zx4D3oslSi7QVDSE7YDYG88DyL2tS_2ZeheKN8/edit) |
| 37 | `copsoq3_he_en@1.0.0` | catalog only | HE3 meaning, HE4 retention and version selection | [Doc](https://docs.google.com/document/d/19M0beVVFa3aLFc50QNKgxvMT0vQg--pvuby9pZFqAkI/edit) |
| 38 | `copsoq3_he_zh_cn@1.0.0` | blocked | 4/4 review, HE3 difference and HE4 deletion | [Doc](https://docs.google.com/document/d/1Zqum5D7ybbk1qx4Fko09P1PAXjHsz-NSzpmIMJOyQlo/edit) |
| 39 | `copsoq3_hsm_en@1.0.0` | catalog only | conditional multi-select, sensitive-data safety and non-accountability | [Doc](https://docs.google.com/document/d/1cI48AKXSRrwa7yaPqI-9kjRYfg04xOVmAVavsHO3Sog/edit) |
| 40 | `copsoq3_hsm_zh_cn@1.0.0` | blocked | 2/2 alignment review and sensitive-event protocol | [Doc](https://docs.google.com/document/d/1TZiPKAkkdzdeOLFB16BFZhhREwQgc1k7LTw9dx8Jbms/edit) |

## Family-level findings

- CQ, GS and HSM are exposure/category records. Response types 4 and 5M are not
  ordinary continuous 0–100 dimension scores.
- CS and DS are four-week health/symptom dimensions, not ability tests or
  clinical diagnostic instruments. The Chinese study involved item trimming.
- International CT has five items including a reversed LONG item, while the
  revised China analysis removes CT5.
- The China paper refers inconsistently to CW4 and CW5 when discussing/removing
  an item; the final key must come from the version steward.
- GH combines CORE and LONG items with distinct response formats, and the China
  exploratory analysis removes the self-rated-health dimension.
- The China analysis removes HE4, while the catalog also records an HE3
  semantic difference.

## Rights and thresholds

The COPSOQ Network publishes the questionnaire under CC BY-NC-ND 4.0 with
additional guidelines. Unmodified material may be shared with attribution;
modified material must not be distributed as COPSOQ; commercial services may
charge for assessment or advice but not for the questionnaire itself. Existing
country/language teams must be contacted before translation or adaptation.
The China study team's authorization does not automatically sublicense this
platform.

The China validation states that fixed cut-offs for psychosocial exposure are
not accepted and recommends comparison with appropriate reference values.
Healthcare-worker distributions are not teacher norms.

## Primary sources

- [COPSOQ licence, guidelines and questionnaire](https://www.copsoq-network.org/licence-guidelines-and-questionnaire)
- [COPSOQ III international questionnaire and response codes](https://www.copsoq-network.org/assets/pdf/COPSOQ-network-guidelines-an-questionnaire-COPSOQ-III-180821-1.pdf)
- [China healthcare-worker preliminary validation](https://www.mdpi.com/2227-9032/13/7/825)

All 20 Google Docs were read back after writing. Each contains the exact tool
key, decision, identity and structure, rights, scoring and threshold boundary,
duplicate/version relationship, production decision, unblock conditions and
three primary source links.

