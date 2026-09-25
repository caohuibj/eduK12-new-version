# Student Traits PILOT Batch 2

## Scope

This batch adds five Chinese Scale instruments without changing shared Scale runtime code:

1. `grit_s_zh_cn@1.0.0`
2. `bscs_zh_cn@1.0.0`
3. `cdrisc2_zh_cn@1.0.0`
4. `general_fixed_mindset_zh_cn@1.0.0`
5. `cross_domain_talent_beliefs_zh_cn@1.0.0`

All five start at `PILOT` scientific maturity. Product/database publication remains a separate explicit governance action.

## Canonicalization decisions

### Grit-S

The historical T1 questionnaire embedded the eight Grit-S items in a 33-item container and used a generic 1–5 agreement scale.

The product package restores the standard 8-item Grit-S form:

- five-point “like me” response semantics;
- canonical item order;
- reverse-keyed items 1, 3, 5, and 6;
- Consistency of Interest = items 1, 3, 5, 6;
- Perseverance of Effort = items 2, 4, 7, 8;
- overall Grit = mean of all eight items after keying.

The report shows the overall score plus the two facets, with no percentile, cut-off, high/low label, or high-stakes interpretation.

### Brief Self-Control Scale

The historical study also embedded the 13 BSCS items in the same 33-item container and used agreement anchors. The product package restores:

- the standard 13-item order;
- five-point “like me” response semantics;
- reverse-keyed items 2, 3, 4, 5, 7, 9, 10, 12, 13;
- one primary overall self-control mean.

The historical project groupings (“Disciplined Planning”, “Impulse Inhibition”, “Self-Management”) are not published as formal BSCS subscales.

### CD-RISC2

The historical study changed CD-RISC2 to a 1–5 agreement format and averaged the two items. The product package restores the standard form:

- canonical two-item order;
- past-month timeframe;
- 0–4 response scores:
  - not true at all;
  - rarely true;
  - sometimes true;
  - often true;
  - true nearly all the time;
- sum score 0–8.

No published population cut-off or quartile is activated in the PILOT report.

### General Fixed Mindset

This package intentionally preserves the exact project form:

- three Chinese project-adapted items;
- 1–6 agreement scale;
- higher score = stronger general fixed-ability belief;
- at least two answered items required for a limited/prorated mean.

It is labeled as a project adaptation informed by the Dweck implicit-theories framework, not as an exact published Dweck scale.

### Cross-Domain Talent Beliefs

This package intentionally preserves the self-developed project form:

- four Chinese items;
- 1–6 agreement scale;
- higher score = stronger belief that talent differs across school subjects;
- at least three answered items required for a limited/prorated mean.

The report explicitly states that this score measures a belief about cross-subject talent differences and does not measure actual talent.

## Reporting policy

All five packages use descriptive, non-normative reporting:

- no diagnosis;
- no percentile or norm;
- no cut-off;
- no categorical “type”;
- no school ranking or high-stakes selection;
- no inference from a belief score to actual intelligence, talent, ability, or future achievement.

## Evidence and provenance

The published instruments retain their immediate source citations:

- Duckworth & Quinn (2009) for Grit-S;
- Tangney, Baumeister & Boone (2004) for BSCS;
- Vaishnavi, Connor & Davidson (2007) for CD-RISC2.

The two project measures retain the project Canonical Data Package internal-consistency evidence:

- General Fixed Mindset: alpha = .866 in the Final T1 general sample;
- Cross-Domain Talent Beliefs: alpha = .852 in the Final T1 general sample.

The project owner has confirmed rights/authorization for planned Huisurvey use; durable authorization remains governed outside the executable source.

## Deterministic verification

Focused tests lock:

- source and executable package validation;
- Grit-S response format, reverse keys and three score outputs;
- BSCS standard 13-item order, nine reverse keys and overall-score-only reporting;
- CD-RISC2 0–4 response format and 0–8 sum;
- General Fixed Mindset 2-of-3 limited scoring;
- Cross-Domain Talent Beliefs 3-of-4 limited scoring;
- descriptive report policy and `referencePolicy: none` for all five instruments.
