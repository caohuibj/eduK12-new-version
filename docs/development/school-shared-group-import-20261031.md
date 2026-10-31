# Exact shared reporting increment after history paging

Parent is the independent history commit `e527d13370c531021edc5dc47cf3f3be9bce19f0`. This local slice imports only four files from the Group owner's internally delivered `9dedd85fd2cff4e0510a1bff72fe58a4b9b3375c` / native continuation `21f15b91627a3d3a500957f9d1af837324389675`. Those source commits were not fetched or uploaded in this turn; this is an exact patch transfer with documented provenance, not a claim that their remote refs exist.

All four original base blobs matched before patch preparation. `git apply --check` succeeded and every applied after blob exactly matches the delivered owner hash:

| Module | Before | After |
| --- | --- | --- |
| reporting/engine.ts | `6aabd0db80380e607994ca81802b4db3c2eaa139` | `b24ff6d7d8ead1f49a66e1f2b32c8ce195ef53cc` |
| reporting/service.ts | `5ee9418f96a6c1c094af537a6027cc3f6ef8137c` | `ee07290182fcf657060d7b6c0c17a675ba77a8b0` |
| reporting/types.ts | `22a008a4cb09b5807ee3e35bdfd0609eaa1eb73b` | `7d003d6ac7cfaeaf71d8ed6365e20100acfef9d8` |
| education-tools/assessment-resource.service.ts | `386e7395a67aebdba9383aecbdfee2680ecdceac` | `cf2893b4bf626313639d4a5a1ebfe95db19c7468` |

The engine stores metric-specific contributing execution references only at the internal V2 payload root and only for an unsuppressed subset. They do not enter its projection. The public artifact method explicitly returns ID/time/authorized projection; the School projection and authorized CSV path consume that projection. No frontend DTO, route parameter or export column was extended with internal IDs. The optional `beforePersist` callback is a server function between building and the original persistence/current-authority checks; no HTTP/controller input accepts it. This import does not add a new School partial-cohort feature or modify its existing release/privacy rules.

The publisher fix was located at the same base in the native GROUP snapshot binding rewrite. It omits `educationBinding` when absent instead of inserting an undefined-valued property that fails canonical freezing. An existing binding is still copied with the same adapter version. No private Scale/composition source or role rule is rewritten.

The four exact imported modules passed a focused semantic integration check with zero diagnostics. No full type suite, Group unit case, twenty-FINAL native chain or old application journey was replayed. The Group owner's same-blob source evidence is retained under its original node/commit identity; it is not relabeled as a local execution. Source-only diff checks pass. The history commit, Training helper changes and all School-owned code are retained; no full-file checkout or Teacher implementation was imported.

Raw provenance and the incremental result are in `docs/evidence/school-shared-group-import-20261031/manifest.json`. Formal qualification remains pending. The denied quota tree operation was not retried; this turn performed no external GitHub/Notion write, merge, deployment or production permission change.
