# Staff UI launch upgrade — PR #178

## Scope

This launch-polish PR implements the three staff workspace requirements without changing authoritative assessment, reporting, permission, or classroom runtime semantics:

1. **去哪儿** — navigation, hierarchy, breadcrumbs, safe deep-link return, and route closure.
2. **做什么** — primary/secondary/danger action hierarchy, explicit action names, contextual More menus, confirmation and feedback.
3. **怎么看** — information density and task-appropriate Table/Card/Form/Detail/Report layouts.

The change is intentionally scoped to ADMIN/TEACHER presentation and Organization management surfaces. Student assessment runners, scoring, frozen reporting identity, subgroup privacy, Organization authority, export authority, and classroom socket protocols remain authoritative in their existing domain implementations.

## Implemented

### Staff shell and navigation

- Grouped staff navigation into teaching, assessment, organization, content, system, and account work domains.
- Added staff navigation search without changing route registration or authorization.
- Added route-specific document titles and hierarchical breadcrumbs.
- Added an Organization index and explicit unknown-subpath state.
- Preserved safe return-to behavior for Organization deep links.
- Removed duplicate Organization links from the header; the header keeps account/organization context while navigation owns destinations.
- Added nested Organization routes to the generated route inventory.

### Action hierarchy and interaction

- Added reusable management dialog, confirmation/feedback, More-actions, and section-navigation primitives.
- Removed browser-native `alert()` / `window.confirm()` from the main teacher/admin management surfaces.
- Course cards now emphasize **进入课程** and **管理学生**; low-frequency and destructive actions live under More.
- Action labels identify their object or outcome rather than using ambiguous standalone “查看”.
- Destructive actions remain explicit and visually separated.
- Loading, empty, success, warning, and error presentation uses product status patterns.

### Information density and layouts

- Course discovery remains a card grid because visual recognition is the primary task.
- Assignment and check-in management are compact comparison tables.
- Course → assignment/check-in handoffs retain the selected record via `?id=` and focus the matching row.
- Video remains a preview card library; image remains a gallery; document management is a compact table.
- Organization governance, runs, reporting, and delivery use management width instead of the default reading width.
- Assessment Runs are presented as **测评批次** and listed in a comparison table.
- Reporting and Delivery expose teacher/admin task language while keeping immutable/artifact/series identifiers in advanced technical areas.
- Large existing authoring controllers use the management workspace shell without rewriting their save/publish/runtime protocols.

## Explicit non-goals / deferred findings

These items were intentionally not changed because they would require domain or API changes rather than launch-safe presentation polish:

1. **Organization member display names.** Membership projections currently expose stable user IDs but not a guaranteed display-name projection. A future API/read-model change can replace technical IDs with human-readable identity without changing membership authority.
2. **Full-page conversion of Assignment / Check-in authoring.** Their existing editors include rich text, attachments, grading/submission state and nested selectors. This PR improves the surrounding management list and dialog semantics but does not split those controllers into new edit routes, avoiding a late pre-launch state-management rewrite.
3. **Run / Reporting advanced contract terminology.** Resource keys, selectors, policy hashes, Series/Wave and immutable artifact identifiers remain available under advanced/technical sections because operators may need them for audit and recovery. No scientific/reporting contract is renamed in storage.
4. **Backend authorization / lifecycle semantics.** Organization authority, explicit denies, Run publication/freezing, reporting privacy, artifact authorization, export tickets, assessment scoring and classroom socket ACK ordering are unchanged.
5. **New dashboard analytics.** No new KPI API or database aggregation was added merely to decorate the staff landing page.

## Acceptance gates

The PR is ready only after:

- route inventory check;
- frontend typecheck;
- focused staff/navigation/Organization tests;
- full frontend test suite;
- lint and production build;
- browser acceptance for ADMIN and TEACHER at desktop and narrow widths;
- exact-head repository CI.

Primary browser journeys:

- Admin login → Course → Course detail → specific Assignment / Check-in.
- Admin → Users / Teacher codes / grants.
- Teacher login → Course / Students / Assignment / Check-in / Classroom.
- Organization index → governance → assessment runs → run detail → reporting → delivery.
- Direct Organization deep link → login → original destination.
