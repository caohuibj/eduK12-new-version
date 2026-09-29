# Huisurvey Report Visualization System

## Scope

This contract governs frontend visualization of server-projected reporting data.

It extends the Report Reading System. It does not change report generation,
scoring, reference calculations, evidence ceilings, privacy thresholds, or
longitudinal comparability decisions.

## Source of truth

Visualization follows this pipeline:

```
server projection
→ safe visualization adapter
→ chart model
→ ECharts SVG renderer
```

The browser is a renderer, not a statistical engine.

## Longitudinal values

A chart point may be created only from an explicit numeric value in the
authorized server projection.

- Matched longitudinal charts use projected `waveMeans[].mean`.
- Repeated-cohort charts use only an explicit numeric `aggregations.mean`.
- Individual longitudinal charts use projected `metric.value`.
- Missing, malformed, or unavailable values remain gaps.
- The frontend must not infer a mean from another aggregation.

Internal Wave IDs are adapter inputs only and must not be emitted into chart
models, labels, captions, or accessible summaries.

## Comparability

Adjacent points may be connected only when the server-projected
`allowedOperations` includes `DESCRIPTIVE_TREND`.

`NOT_COMPARABLE` / side-by-side-only comparisons keep their points visible
when those values are otherwise authorized, but the corresponding segment is
not drawn.

A numerical delta is shown only when both are true:

1. the server decision allows `NUMERIC_DELTA`; and
2. the server projection contains a finite `delta`.

The browser must never calculate `right - left` as a substitute for a missing
server delta.

## Privacy suppression

Suppression is fail-closed.

When a projection or metric is suppressed:

- suppressed numeric values do not enter ECharts series data;
- no tooltip dataset contains those values;
- no hidden DOM or accessible summary contains those values;
- no count, source, neighboring point, or other field is used to reconstruct them;
- a privacy state is rendered instead of a synthetic chart value.

If a projection is malformed and attaches numeric fields to a suppressed
metric, the frontend ignores those numeric fields.

## Chart rendering

Report charts use modular ECharts imports with `SVGRenderer`.

Current longitudinal charts intentionally do not register or use the ECharts
tooltip component. Visible labels and text summaries provide the important
values without hover-only interaction.

Charts use the Modern Education design tokens:

- action blue for descriptive data marks and permitted connections;
- ink / muted / line tokens for text and structure;
- amber only for privacy or caution state, not for score quality;
- no red/green good-versus-bad encoding.

Animation is disabled. Reduced-motion behavior therefore does not hide
essential information.

## Accessible representation

The SVG plot is supplementary. The same authorized values used by the chart
are presented in visible text beneath it.

The text layer includes:

- human-readable Wave labels;
- projected values;
- server-projected deltas when allowed;
- comparability / suppression explanations.

Information required to understand the report must not depend on hover.

## Responsive and print contract

Canonical validation covers:

- 390 px mobile;
- 768 px tablet;
- 1440 px desktop;
- A4 print-media evidence.

Charts must not create page-level horizontal overflow or clip their meaningful
labels. Category-axis boundary padding keeps first and last point labels inside
the plot area.

A4 uses the same server-projected values as screen presentation; print does not
recompute or simplify statistics.

## Review rubric

For every report visualization change, review:

1. **Scientific semantics** — no frontend-derived statistics.
2. **Comparability** — lines and deltas obey backend operations.
3. **Privacy** — suppression is not reversible through presentation details.
4. **Hierarchy** — interpretation precedes visualization; evidence remains available.
5. **Density** — calm report reading, not dashboard overload.
6. **Responsive behavior** — no mobile clipping or essential hover interaction.
7. **Print** — A4 remains readable.
8. **Accessibility** — important values have a non-chart textual representation.

Canonical screenshots are review evidence, not pixel-diff golden masters.
