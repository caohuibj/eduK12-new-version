# Cognitive content integration and structural audit

Base main: `642fda7ab754790686d6626efac62b73a332e663` (scale and cognitive onboarding mechanisms merged).
Existing PR360 source: `072b2900d4295c7d741d5e55c9ce6cfbbf6f58d2`.
This branch preserves existing content and implementation history rather than
rebuilding candidates. It is an unqualified integration draft, not an activated
library or a deployment. Original PR360 remains unchanged.

## First repair batch

Six existing package descriptors listed report fields in tiers different from
their metric visibility. They failed the current generic publication structure
validator despite having custom candidate reports. Separate commits align only
those previously declared report fields:

- attentional-blink: validTrialCount → user.
- balloon-effort: validChoiceCount and highEffortChoiceCount → user.
- dual-arrow: validTrialCount → user; receivedTrialCount → detail.
- gradcpt: medianCorrectRT → user; presentedImageCount → detail.
- horizon-exploration: validFirstChoiceCount → headline; completedGameCount → user;
  receivedGameCount → detail. These three counters already appear in the custom
  public projection, and are quality/context fields, not ability scores.
- visual-search: accuracy → user; receivedTrialCount → detail.

No task stimulus, sequencing, counts, scoring formula, quality state, timing,
input behavior, report wording, reference or authorization was changed. Research
maps, arrays and reportBinding remain research_only. Existing protocol/config/
scorer identities and frozen report projection contracts remain unchanged; this
is correction of unpublished candidate descriptor consistency, not retroactive
recalculation or replacement of installed versions. No norms are invented.

Root ran only the new direct structural consumer check on these six changed
packages: six passed, zero failed. It checks generic validation, runtime compiler,
matching declared tiers, research-only maps/arrays, DRAFT state and absent norms.
Original JSON and log are in `evidence/report-visibility.*`. This does not execute
scorers, prove scientific validity, qualify browsers or establish database
installation. Original test histories stay in the source branch.

## Remaining work, not silently passed

- Review current source/scoring/parameter/report combinations and necessary raw
  score examples for each admitted package; use unchanged qualified evidence.
- Share existing native configuration factories with selected installation,
  without two registries or importing Prisma seed files across src rootDir.
- Verify installation preview/idempotence/frozen identity in an isolated database.
- Preserve public/anonymous/organization raw-archive authority boundaries. Native
  Training support is not automatically all four entry adapters or public usage.
- Real library registration, publication, entry assignment and deployment each
  need their actual execution evidence. Source presence is not installation.
- PR330 remains source/design material, not an executable candidate to recount.

Full integration CI has not run. The inherited PR365 exact CI binding is not a
valid binding for this new content branch; no Ready or activation is requested.
Only this batch's directly affected structural check has run on this candidate.
