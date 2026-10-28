# Four-entry loading implementation / PR378

Base b7909cbf. Product 10a32d20a1ef767791d5d1f03b7e582a1bb6c772; frontend 77babf45b8eba4b14e0f22be9a6c3ffd523b6e00. Backend/schema/locks/permissions/timing/scoring/report body unchanged.

## Delivered
- School/Teacher page imports now defer heavy studios, task and report consumers; shared existing RetryableLazy preserves parent navigation and permits download retries. No cached task authority.
- Public homepage can render during auth, but protected School deep links retain auth loading and do not request a marketing hero.
- Teacher hidden subpages only mount after first visit, retain drafts thereafter. Scope-bound directories load only in authorized school workspace; refresh fetches each once, ignores old scope and distinguishes pending/error/empty. Already mounted relationship drafts survive refresh; fieldset blocks writes while directory is pending/failed.
- School/Teacher cognitive and SJT, Survey native SJT presentation code load only when needed, before runner-owned timing/admission; no prefetch of future stimuli.
- Training heavy admin styles follow existing lazy shell and actual legacy consumers. Tiny neutral auth/loading frame remains eager.

## Verification and limits
Retained original reports: 122 first-candidate cases; 13 updated directory/navigation cases replace identical names, not double-counted. Current full frontend npm typecheck passed. Initial missing backend dependency symlink/type inference and fixture eager-hidden assumptions remain in raw failure archives; no business authority was weakened. Lint exit0 (existing warnings retained).

CI: exact source, reviewed-original admission, one production build feeding gzip1 closure accounting and six compiled browser consumers, current frontend/control CodeQL, stable required gate. No backend builds, DB, migrations, restore, platform replay or deployment. The unchanged previously reviewed report rendering evidence is not replayed. Browser fixtures test loading/display, not live authentication/FINAL; route-fulfilled assets do not measure real network transfer or cache behavior. Static gzip estimates exclude public images/fonts/APIs.

Budget: source/admission verification5min; admission with build/browser15min; CodeQL existing30min. At5min report actual waiting job. Unknown paths, changed base/source, skipped/failed selected jobs block normal merge. Keep original failed runs. Broader repeated network/throughput measurements and education parent inline feedback remain separate roadmap tasks.
