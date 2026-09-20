# Wave 1 P1 — Implementation Status

Date: 2026-09-20
Branch: `content/scale-expansion`
Baseline: `main@e10b77af73e3fad6bc62aa941dc883b7bd452c21`

## Implemented

### Existing executable P1 families

- **WHO-5**
  - existing executable Simplified Chinese package retained unchanged;
  - existing scoring/report runtime retained unchanged;
  - mainland-China university validation (Fung et al., 2022; N=1,414) is now surfaced in the expanded Library evidence view;
  - evidence boundary explicitly states that this study does **not** directly validate the current product's 9–18 K-12 entry boundary;
  - no Chinese norm/percentile/diagnostic reference has been activated.

- **SDQ**
  - existing Parent zh-CN and Teacher EN T4–10 packages retained unchanged;
  - electronic-administration authorization gate retained;
  - Du, Kou & Coghill (2008) Shanghai validation evidence is surfaced;
  - evidence boundary records 3–17 parent/teacher and 11–17 self-report coverage plus weaker psychometrics for some subscales;
  - Teacher package explicitly warns that Chinese validation evidence is not exact-form evidence for the current English executable localization;
  - no local cut-off/norm record has been activated automatically.

### Catalog-first P1 instruments

The following are now visible in Scale Library as `REVIEWED + PILOT`, but intentionally have no executable package and are always `NOT_AVAILABLE`:

- **DASS-21 zh-CN**
- **GSE zh-CN**
- **MPFI-24 zh-CN**
- **PSS-10 zh-CN**

For each entry the platform now exposes:

- canonical identity;
- construct/domain;
- respondent and validation-population boundary;
- item count / estimated burden / time frame;
- Simplified Chinese localization provenance state;
- Scientific Evidence Matrix records;
- rights state from InstrumentAuthorization;
- planned report dimensions and limitations;
- explicit reasons why the instrument cannot yet launch.

No protected item text or scoring transforms are exposed through the Library payload.

## Report designs

### DASS-21

Planned dimensions:
- depression-related experience;
- anxiety-related experience;
- stress/tension-related experience.

The planned report is descriptive only. It does not expose clinical severity labels, diagnosis, Chinese percentile/norm or automated high-risk interpretation. The official DASS online-use guidance currently blocks respondent-facing automated score interpretation; therefore no executable respondent report is enabled.

### GSE

Planned dimension:
- generalized self-efficacy.

The report will describe self-reported coping/agency beliefs only. It must not be represented as intelligence, academic attainment, objective ability or executive-function performance. No norm percentile is planned without a version-matched reference set.

### MPFI-24

Planned primary dimensions:
- psychological flexibility;
- psychological inflexibility.

These are kept as related but distinct process dimensions. No diagnosis or treatment-effect claim is allowed. Lower-level process scores may be added only after the exact 24-item Chinese scoring map is frozen and verified.

### PSS-10

Planned dimension:
- perceived stress.

The report will describe perceived unpredictability/uncontrollability/overload during the recall period. No clinical cutoff or normative rank is enabled.

## Engineering changes

- `ScaleCatalogRegistry` now permits `CANDIDATE`/`REVIEWED` catalog-first entries without packages as **warnings**.
- `ACCEPTED` entries still fail closed when the package is missing.
- The original Wave 0 `buildScaleLibraryReadModel()` remains unchanged, preserving existing six-entry unit tests and runtime behavior.
- `scaleLibraryController` now serves an expanded read model that appends Wave 1 P1 catalog-first entries.
- Candidate entries cannot receive a launch route even if an InstrumentAuthorization record exists; an executable package is still mandatory.
- The Scale Library frontend now recognizes `SELF_EFFICACY`, describes candidate reports as design previews, and no longer labels the library as Wave-0-only.

## Tests added

`scale-library-wave1-p1.test.ts` covers:

- `REVIEWED + PACKAGE_MISSING` is a warning rather than a registry error;
- six existing entries + four catalog-first entries;
- all four new entries are `NOT_AVAILABLE` and contain no launch route;
- authorization alone cannot make a catalog-first instrument launchable;
- existing filtering semantics still work;
- Chinese validation populations are exposed without norm/diagnostic claims;
- WHO-5 and SDQ validation evidence is added without activating references.

## Remaining blockers before executable-package promotion

| Instrument | Blocking work |
| --- | --- |
| DASS-21 | Enforce official restricted-group / non-respondent automated-feedback policy in product/report access before executable deployment. |
| GSE | Freeze exact Chinese form and represent the official restricted/password-protected online-use condition; do not publish the full scale openly. |
| MPFI-24 | Freeze exact Simplified Chinese item/scoring source and record redistribution/digital-use provenance. |
| PSS-10 | Record MAPI/ePROVIDE permission plus Chinese translation rights before item text enters a code-owned package. |

## Verification state

The branch has no pull request and ordinary branch pushes do not trigger the repository's PR CI workflow. At this status snapshot there is therefore **no CI result to claim**. The changes have been statically reviewed for schema/gate compatibility, but backend `tsc`, Vitest and frontend build should be run when this content branch is promoted to a PR or otherwise executed in a CI-capable environment.
