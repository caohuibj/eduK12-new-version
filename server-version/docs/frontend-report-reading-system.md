# Huisurvey Report Reading System

## Scope

This phase changes frontend report presentation only.

It does **not** change:

- scoring or item transforms;
- report projection contracts;
- reference selection;
- percentile / criterion calculations;
- evidence ceilings;
- privacy suppression;
- longitudinal comparability;
- backend export content.

## Reading hierarchy

Canonical report order:

1. report identity and completion facts;
2. core feedback / interpretation precondition;
3. headline or total metrics when explicitly provided;
4. dimension / task / module profiles;
5. explanation and educational guidance;
6. reference, evidence and method details;
7. limitations and disclaimer.

Scientific details are moved later in the visual hierarchy, not removed.

## Scale rules

Scale presentation uses the explicit `score.type` field.

- `total` may appear as a headline/overall result.
- `dimension` appears in the dimension profile.
- missing `type` is rendered as an unclassified score and is never inferred.
- a scale with dimensions but no total does not receive a frontend-generated total.
- each score keeps its own raw range.
- dimension tracks are therefore not normalized for cross-dimension comparison.

A reference overlay is drawn only when a score has exactly one available reference in the current audience-safe projection.

If multiple references exist, the range track does not choose one; all references remain available in the detailed reference section.

Criterion bands are rendered only from server-projected `criterionBand` values. The frontend does not introduce red/amber/green diagnostic bands.

## Cognitive rules

Cognitive metrics retain their original units.

Milliseconds, ratios, percentages, counts and other quantities are shown as small multiples. The frontend does not normalize heterogeneous units into radar charts.

All existing quality fail-closed rules remain authoritative:

- uninterpretable single-task reports hide quantitative metric sections;
- invalid V2 reports hide reference rows;
- presentation version / historical label rules are unchanged.

## Situational rules

When every frozen metric contains `construct` and `channelKey`, the frontend may rearrange those existing values into a Construct × Channel matrix.

When those fields are incomplete, presentation falls back to independent metric profiles.

No overall SJT score or radar area is generated.

## Composite rules

Composite and questionnaire reports add a navigation/index layer only.

Each unit keeps its own frozen report semantics. The frontend does not aggregate unit scores into a new overall value.

## Print contract

A4 print mode:

- removes AppShell navigation and report actions;
- keeps report identity, quality, metrics, evidence, limitations and disclaimers;
- expands collapsed report details for print;
- avoids splitting metric/range/section blocks when practical;
- uses the same server-projected values as screen presentation.

## Visual QA

The canonical visual matrix includes a deterministic multi-dimensional Scale report at:

- 390 × 844
- 768 × 1024
- 1440 × 1000

The desktop capture also produces an A4-oriented print-media screenshot.

The fixture contains illustrative values only and performs no write API calls.
