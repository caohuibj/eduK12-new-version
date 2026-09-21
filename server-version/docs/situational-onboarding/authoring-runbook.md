# SJT content authoring and publication

Run commands from `server-version/backend`.

1. `npm run situational:scaffold -- my-new-sjt@1.0.0 --from sjt-assertiveness-golden@1.0.0` creates a copy to edit, explicitly DRAFT/PILOT. It never copies publication approval and refuses to overwrite an identity.
2. Edit `instruments/<key>/<version>/instrument.json`: the existing V1 or V2 definition and independent golden expectations. Edit all task wording/rights/interpretations for the intended instrument. No JS/TS, scorer upload or new frontend runner is accepted as ordinary content.
3. `npm run situational:manifest:generate` and `npm run situational:onboarding-check -- --all --json`. Schema errors, duplicate identities and manifest drift are build errors. Structurally valid incomplete DRAFTs report technical blockers without becoming participant-admissible.
4. Use `--content-only --base <full-base-SHA>` to verify the actual tracked and untracked diff. Only owned JSON/test data/assets and exactly regenerated manifest are allowed. Generator, CI, policy or shared code changes are platform work.
5. Open a DRAFT content PR and obtain a human GitHub APPROVED review from an independent collaborator with write/maintain/admin permission. Approval must cover the exact content digest printed by the gate. Copy its real `https://github.com/caohuibj/eduK12-new-version/pull/<n>#pullrequestreview-<id>` URL into publication.json, with `kind: github-review` and `contentDigest`, then explicitly set releaseStatus to PUBLISHED. Do not invent review records.
6. CI validates the review state, independence, repository permission, superseding review and content at the reviewed commit. Changing content invalidates the receipt. Merely passing a technical gate does not publish anything.
7. Before deployment, complete the required backend/frontend/browser gate and content review. Media references use the existing immutable StoredAsset identity/contentHash; actual deployment asset readiness and bytes are checked by the existing asset service/browser lane. Offline schema checks cannot certify a remote asset exists. No new media store is introduced.

Once published, changing instrument.json requires a new instrumentVersion (including changed golden expectations/catalog presentation). A changed scoring contract also needs an appropriate scoringVersion. Exact old identities are retained. DRAFT -> PUBLISHED -> RETIRED affects admission, not definition/runtime hashes. Retirement preserves frozen completion/history and does not require reapproving the original author’s scientific claims.

`scientific.json` deliberately accepts PILOT only in PR1. Its revision is separate from execution identity; source-owned advanced qualification and historical governance projection are PR2, not an unimplemented advanced label in PR1.

## CI activation / human decision boundary

At the baseline, main has an active ruleset requiring `merge gate / ready PR`, with zero required approving reviews. The new authority/immutability check is inside backend CI and therefore participates in that required aggregate. The independent `Situational publication integrity` workflow also rechecks on review submission/dismissal. Before enabling future new production content publications, configure its `publication` check as a required ruleset status as well: otherwise a dismissal after an earlier green aggregate is visible but may not independently block merge. This PR does not silently modify repository-wide rules or claim that this rollout prerequisite is already enabled.

Historical migration receipts are limited to the three content digests captured from main a3098d8; they do not fabricate retrospective review timestamps or authorize other identities. The runtime trusts a CI-verified static build, not mutable filesystem discovery or a runtime call to GitHub.
