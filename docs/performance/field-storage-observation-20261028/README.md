# Encrypted field storage: bounded observation, not capacity qualification

Source: main `8774b1cf158dae1c5eb0f4950044c6ae6d6a18dd`, Node 24.22.1,
PostgreSQL 17.11. No application code, production configuration, database schema,
COS mechanism, permissions or deployed version changed.

## Why measure this

The four-entry roadmap asks for cost-effective storage without repeated scoring
or deferred report reconstruction from COS. The shared runtime encryption writer
already supports both legacy and compact authenticated formats. Do not build
four codecs or assume compact always improves every kind of record.

This experiment calls that actual writer and reader. One input is the saved
synthetic C1 Scale result from the fixed PR371 probe; the other is an explicitly
synthetic tiny completion-control object. The same saved result is repeated,
with random encryption nonces and distinct table row IDs. Every decoded value
must equal the original canonical hash. No instrument is rescored.

## Actual field-layer results

Bytes are decimal bytes, not MB estimates. Physical figures include the dedicated
measurement table, its primary-key index and TOAST. Each table contains only
`id bigint primary key` and `payload text not null`, not the complete application
schema. PostgreSQL custom dumps use compression level 6 in this local experiment.

| Payload | Rows | Format | Cipher bytes | Total relation bytes | Local dump bytes |
|---|---:|---|---:|---:|---:|
| Saved Scale result | 1 | legacy | 5,840 | 49,152 | 5,436 |
| Saved Scale result | 1 | compact | 2,247 | 49,152 | 3,815 |
| Saved Scale result | 100 | legacy | 584,000 | 679,936 | 336,246 |
| Saved Scale result | 100 | compact | 224,700 | 344,064 | 165,921 |
| Saved Scale result | 1,000 | legacy | 5,840,000 | 6,389,760 | 3,339,618 |
| Saved Scale result | 1,000 | compact | 2,247,000 | 2,957,312 | 1,639,976 |
| Tiny control | 1,000 | legacy | 236,000 | 360,448 | 142,000 |
| Tiny control | 1,000 | compact | 245,000 | 385,024 | 122,040 |

For the 1,000 saved-result rows, compact is 61.52% smaller in ciphertext bytes,
53.72% smaller in total relation size, and 50.89% smaller in this local dump.
For the tiny comparator, ciphertext grows 3.81% and relation size grows 6.82%,
while the compressed dump is smaller. Small single-row relations have the same
minimum allocated pages despite differing logical bytes.

Observed cumulative WAL deltas at 1,000 rows: saved result 6,419,136 versus
2,677,928 bytes; tiny control 371,192 versus 379,216 bytes. Background effects
are not attributed to individual rows. Observed encoding CPU totals were
38.928 versus 117.263 ms for saved results and 17.889 versus 35.864 ms for tiny
controls. These are one fixed-order local sequence, not a comparative benchmark
confidence interval, production CPU regression, p95 or throughput limit.

## Boundaries and next decision

- Twelve observation rows passed exact stored count/length and all codec
  roundtrip equality checks. This is a measurement script, not twelve product
  acceptance cases. The successful wrapper exited 0 after 1.920 seconds.
- The first loader invocation failed before measurement because the `.ts`
  wrapper was treated as CommonJS with top-level await. The same script bytes
  were loaded as `.mts` in a separate fresh database; original exit 1 remains.
- Real private bindings, shared templates, parent/child receipts, indexes,
  migrations, historical mixed-format records and other table overhead are
  not included. C05/C06 full lifecycle accounting remains open.
- Dump size is not restored-data integrity, encrypted backup durability, COS
  uploaded bytes, retention policy or a bill. No archive or report was rewritten.
- The runtime feature flag was toggled only inside this measurement process.
  Actual production feature state was not read or changed. Ephemeral synthetic
  encryption keys are not retained; these dumps are not recovery deliverables.
- Do not introduce a global small-record cutoff from one toy control payload.
  Some compact-domain readers require the authenticated compact format, and
  shared-control references are already specialized. Inventory real writers
  and measure their distributions before changing a format or policy.
- Next: account for actual whole/standalone persistence at increasing answer
  counts, including fixed template/relationship cost, original/result/report
  ownership and WAL/backup overhead. Keep normal report reads independent of
  COS and do not add redundant report correction jobs.

PR374 owns the separate same-Scale four-entry user-path repair and verification.
This observation does not validate those paths or make the content package
publicly installed. No merge or deployment is implied by publishing this record.
