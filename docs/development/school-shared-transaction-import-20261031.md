# Shared artifact transaction increment

Parent `eb49e3ab7be4d8fa7b8a6e02effcb8facf99fc73`; exact internal transfer from Group `cf43248e639ae6c4598d60db3513e8d78cbe5be6`. Only two reporting production files are imported after matching their original bases and passing `git apply --check`:

- `artifact.ts`: `244795010b5a7e94b5882d8a86f40c82e602a122` → `4319aefb8152c03de0b133ec8de2c025c81419e6`.
- `service.ts`: `ee07290182fcf657060d7b6c0c17a675ba77a8b0` → `10e958b45ffe8f5b8a429651d80a964b1ce19633`.

`createOrReuseReportingArtifact` accepts an optional original transaction client. Artifact INSERT, audit INSERT and stored verification all use that same client. Without a supplied transaction the original ReadCommitted transaction remains the default. A supplied expired client is still truthy and goes directly to `persist(tx)`; there is no catch/retry/default-connection fallback. `generateOrganizationGroupAnalysis` forwards only its internal optional tx into this persistence boundary. No HTTP input, new grant, projection field or Teacher implementation is added.

School's existing `report-release-lock.ts` uses a dedicated `pg.Client` SESSION advisory lock rather than a long outer Prisma transaction. That mode and all School callers are unchanged; the Teacher-only comparison and post-commit read changes were not copied. The earlier beforePersist/contributor integration and history pages remain intact.

The exact two imported modules passed a local semantic integration increment with0 diagnostics. The Group owner's actual expiry PG counterexample (P2028, zero artifact/audit rows, released lock) remains its original node/commit evidence; no Group PG, native FINAL, old journey or full type suite was replayed here. This import is not formal CI qualification. Original provenance and the local increment are retained in `docs/evidence/school-shared-transaction-import-20261031/manifest.json`.
