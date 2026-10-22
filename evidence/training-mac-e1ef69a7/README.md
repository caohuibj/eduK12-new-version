# Training Mac existing test evidence — public derivative v1

Source head: `e1ef69a778d6200e73d3125adf7dc373ec7883ee`.
Prior inspected official main: `abade96de544593d0fe67453e4c48a0b478cbe67`.
This branch contains evidence only, no product code or workflow definitions.

## Provenance and redaction

88 existing log files, 16 existing reports and 7 existing metadata files are published,
plus a newly assembled command-coverage index and disclosure manifests.
No tests, types, lint, builds or DB checks were rerun to create this package.
Failures, filtered cases, original incremental runs and earlier failed fixtures
remain visible. Do not interpret this as a full passing run on final HEAD.

`manifest-v1.json` records each original byte length/SHA-256, published
length/SHA-256, byte-identity status, rule, occurrence count and original line
numbers. All replacements preserve line count. Files named `.sanitized-v1.log`
are explicitly versioned public derivatives, including files whose bytes happen
to be unchanged; only `byteIdentity=unchanged` denotes original bytes.
ANSI escape removal is also recorded as a transformation. Database failing-row
payloads, home/repository/runtime paths, UUID identifiers and any private runtime
credential/account literal are replaced, without changing pass/fail summaries.
No configured account or credential literal was found in the original 88 logs.
No original log was wholly excluded; synthetic failing-row values were removed.

The original files remain local. Redacted row values cannot be reconstructed from
this package; outcome counts, test names, error codes and original file hashes
remain inspectable. The package includes no environment file, password, token,
database dump, real media attachment, cookie, session capture or screenshot.

## Commands, inputs and limits

`command-coverage.json` maps all 88 logs to available exact commands and observed
exit records, explicitly marking missing command/exit evidence.
`commands-as-recorded.json` preserves the commands, observed exits and input
commit/hash references originally recorded in each report. Local path placeholders
are intentional redactions, not literal executable paths. Some older records
contain only a summary or grouped command: missing exact argv was NOT invented.
Empty type/lint logs do not independently prove process success; the original
observed-exit record is separate and is not cryptographically signed execution.

`snapshot.json` records product/config/lock Git blobs and hashes, plus post-hoc
installed tool versions. The historical entire node_modules directory was not
hashed contemporaneously. Reports that predate final changes retain their own
input identity; unaffected coverage reuse requires independent review.
`form-template-input-comparison.json` records 15/16 frozen inputs matching the
final local source; the one changed input is presentation CSS. Backend/PG cases
are local synthetic tests with explicit DB guard, not production acceptance.
The local migration backup was archive-list checked, not disaster-restored.

The last toolbar and assessment layout changes were not browser visually verified
because the browser tool was unavailable; real learner/manual acceptance remains
outstanding. Mock Excel-export tests are not real learner-data export validation.
No CI, merge or deployment qualification is granted by this evidence branch.

The branch is an independent evidence-only commit with `[skip ci]`; no PR is
created and no workflow definition is included. Original source branch untouched.
