# TIPI Chinese standard 7-point PILOT

## Scope

This content package adds the Ten-Item Personality Inventory (TIPI) as a standalone
Chinese Scale instrument without changing shared Scale runtime code.

Identity:

- `tipi_zh_cn@1.0.0`
- scientific maturity: `PILOT`
- executable package status: `PUBLISHED`
- product/database publication remains a separate explicit governance action

## Canonical form

This package intentionally does **not** reuse the historical 5-point TIPI response
format from the learning-motivation study questionnaire.

It uses the canonical TIPI structure:

- 10 items;
- original TIPI item order;
- 7 response options from strong disagreement to strong agreement;
- reverse-scored items 2, 4, 6, 8, and 10;
- five separate two-item means:
  - Extraversion = 1 + 6R
  - Agreeableness = 2R + 7
  - Conscientiousness = 3 + 8R
  - Emotional Stability = 4R + 9
  - Openness to Experience = 5 + 10R
- no ten-item personality total.

The Chinese wording follows the Chinese TIPI translation by Jackson G. Lu and
colleagues linked from the Gosling Lab TIPI resource and reprinted in Lu et al.
(2020). The package keeps the original TIPI orientation **Emotional Stability**
rather than converting that dimension to Neuroticism.

## Report policy

The report is descriptive only.

It shows five numeric dimension scores and explains the direction of each trait.
It does not create:

- diagnostic labels;
- personality "types";
- high/low bands;
- percentiles;
- Chinese population norms;
- cut-offs;
- a global personality score.

Each dimension explanation explicitly treats both ends of the continuum as
descriptive tendencies rather than good/bad classifications.

Limitations state that TIPI is an ultra-brief instrument with two items per
dimension and therefore has lower individual-level precision than longer Big Five
measures. The report also records the original authors' warning that coefficient
alpha is not an appropriate primary quality criterion for these broad two-item
dimensions.

## Sources

- Gosling SD, Rentfrow PJ, Swann WB Jr. (2003). *A very brief measure of the
  Big-Five personality domains*. Journal of Research in Personality, 37(6),
  504-528. DOI: 10.1016/S0092-6566(03)00046-1.
- Gosling Lab TIPI resource: canonical 1-7 anchors, scoring, use permission and
  translation index.
- Lu JG, Liu XL, Liao H, Wang L. (2020). *Disentangling stereotypes from social
  reality: Astrological stereotypes and discrimination in China*. Journal of
  Personality and Social Psychology. DOI: 10.1037/pspi0000237. Appendix contains
  the Chinese TIPI wording.

## Deterministic checks

Golden cases cover:

1. all midpoint responses -> all five dimensions = 4.0;
2. all trait-positive poles -> all five dimensions = 7.0;
3. all trait-negative poles -> all five dimensions = 1.0.

The focused test additionally verifies seven response options, the reverse-key set,
five dimension-only outputs, absence of normative bands, and fail-closed behavior
when a required item is missing.
