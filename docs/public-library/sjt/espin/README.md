# E-SPIN: reviewed bilingual research draft

Status: **GO_FOR_DRAFT_CONTENT**, unpublished documentation only. The four Chinese-only corrections were independently re-reviewed and approved on 2026-10-21. This is not psychometric validation, administration approval, runtime readiness or deployment permission.

## Frozen scope

This single-tool research package contains 19 bilingual scenarios, 95 bilingual options, five category labels and complete Appendix D descriptions. Retain the US undergraduate-engineering context and project restriction to adults 18+. The Chinese translation is not validated. No K–12, ability, clinical, percentile or norm claims are permitted.

No instrument catalog, registry, executable scoring engine, runtime, frontend/backend integration, official website JavaScript, logo or other website asset is included. No CI, application test, commit, push, merge or deployment was performed in this packaging task. This documentation belongs to the independent SJT branch, not scales PR #328.

## Review status and immutable source copies

The copied draft files deliberately retain their pre-review status wording and exact approved byte identity. Their historical “pending independent review” statements are superseded **only for content review** by this README's GO_FOR_DRAFT_CONTENT disposition. Do not rewrite those historical files to invent runtime or psychometric approval. Runtime gates remain open.

- `espin-bilingual-draft.json`: canonical bilingual draft, original Appendix IDs, web IDs, categories, domains, source and runtime constraints.
- `espin-bilingual-draft.md`: readable complete bilingual draft.
- `english-extraction.json`: normalized licensed-source English.
- `translation-notes.md`: institutional terminology, ambiguity decisions and four review corrections.
- `report-and-vector-design-spec.md`: descriptive bilingual report templates and independently designed SVG specification, not an actual source image.
- `review-revisions.diff`: four Chinese-only corrections and notes update; English unchanged.
- `manifest.json`: frozen pre-package source file hashes.
- `scoring-contract.json`: non-executable documented selection/count/tie/domain contract, extracted from the approved draft.
- `package-integrity.json`: copy-integrity record. These checks are not repeated content review, psychological validation, runtime tests or CI evidence.

## Attribution and license

Original authors and copyright holders: Malini Josiam, Walter Lee, Stephany Santos and Ananya Saini.

Josiam M, Lee W, Santos S and Saini A (2026). Developing the engineering student preferences in navigation situational judgment inventory using a design-based research approach. Frontiers in Education 11:1855931. DOI: 10.3389/feduc.2026.1855931.

- [Original article and copyright statement](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1855931/full)
- [Official original article PDF](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1855931/pdf)
- [Official supplement PDF](https://ndownloader.figshare.com/files/68624977)
- [Supplement's independent license metadata](https://api.figshare.com/v2/articles/33789052)
- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- [CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en)

English item content is from Appendix C / Table C1, physical PDF pages 5–9. Author descriptions are from Appendix D / Table D1, pages 10–11. The supplement independently carries CC BY 4.0; its permission is not inferred from the article. The article has its own CC BY statement and 4.0 license link, also verified against the PDF copyright page.

Changes: Simplified Chinese translation; English layout wrapping and zero-width characters normalized; page-break continuation rejoined; new bilingual administration/report wording, glossary, design specification and contract documentation added. No author endorsement is implied. Administration instructions are editorial wording based on the reviewed procedure, not a verbatim source instruction block. Preserve attribution, source/license links and modification notices when reusing.

Original supplement SHA-256: a9b3dff6abd3d1a671934344aacad8e401fe13e16a607f5072402d5f8c584edc.
Original article PDF SHA-256: 66df768956329ff72340d05d3120969751767313a93d3477b804e66d6acc77d4.
Frozen reviewed source-package SHA-256: 6ebef86b6fd76079f9d6bcee35d4feb11c1ffa225c38fb624235670a4c1884f1.

[Existing Notion research backup](https://app.notion.com/p/400d27635a388194b177fe975e25fa19?pvs=204) contains complete bilingual content and both original PDFs as hosted attachments. PDF binaries are not duplicated in this repository. Local original-file hashes are not claims that the hosted article attachment was downloaded and re-hashed.

## Runtime blockers (not implemented)

1. Authoritative submission/scoring enforcement of most != least for every scene; front-end messaging alone is insufficient.
2. Require all 19 unique mapped IDs, exactly one most and one least in A–E, reject missing/duplicate/unknown IDs and invalid options.
3. Separate most and least counts, each summing to 19; retain all maximum ties separately. Never substitute minimum most for maximum least.
4. Domain counts use most only; domain sizes are three or four items, not validated subscales.
5. Independent mathematical review of complete paired input vectors and outputs is still required. No total ability score, difference score, diagnostic cutoff, percentile or correct-answer key.
6. Runtime wiring, validation, report behavior and publication gates require separate authorization and evidence. This docs-only package does not register or expose an assessment.
