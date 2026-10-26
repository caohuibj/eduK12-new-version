# PR356 review: admitted Training completion and delegated revocation

Scope: current-epoch exact STANDARD children retain frozen source identity after START; new admission still checks ONLINE, entry policy, live use authority and emergency stops. Whole receipt processing additionally matches the persisted submission/hash/time, parent epoch/slot/context and current consumer lease. Immutable source/axis/content and owner bindings remain checked. No caller bypass flag, remote merge, production access or CI.

Original issuers may revoke their own use under the original current role binding or exact delegated distribution authority for the original measurement. SYSTEM retains emergency revocation. Other issuers and revoked roots are refused; authorization failures return HTTP 403.

Primary validation: local isolated PostgreSQL, synthetic data only. First run: existing real install/ONLINE/Training FINAL and storage constraints passed (2); added lifecycle reached successful delegated revoke/reissue, then found a missing HTTP 403 mapping; receipt negative found an incorrect test error-code case. Evidence retained at `/workspace/scratch/pr356-review-receipts/test.json`.

Affected-only continuation cloned the earlier synthetic baseline (no lifecycle resets): revoked delegation HTTP 403; START then withdrawal/stop then individual FINAL; durable whole ACK then withdrawal/stop; wrong payload hash/lease refused; correct leased processing/replay preserved accepted answers. 1 passed, 3 deliberately filtered. Evidence: `recheck.json`, `flow-recheck.json` in the same directory. Backend types will be checked once after the review fixes are frozen. This is development validation, not formal CI, functional acceptance or deployment.
