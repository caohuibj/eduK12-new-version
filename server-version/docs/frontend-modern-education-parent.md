# Huisurvey Modern Education — Parent Experience

Stack base: PR #180 Modern Education foundation.

## Presentation scope

- Authenticated parent shell palette and navigation.
- Parent home hierarchy.
- Observer task list and self-serve observer issuance form.
- Desktop / Tablet / Mobile responsive composition.
- Relational runner/report routes reuse the shared assessment/report presentation from PR #180.

Responsive intent:

- Desktop: compact parent navigation and two-column self-serve selectors.
- Tablet: collapsed application navigation with preserved reading width.
- Mobile: single-column tasks and self-serve controls, full-width 44px+ actions, hidden breadcrumb, safe-area-aware shell spacing.

## Interaction / logic findings excluded from the visual PR

1. Parent self-serve issuance currently creates a new episode/assignment on every successful “发起观察测评” request. Neither the frontend nor `issueParentSelfServe` checks for an existing OPEN/STARTED task for the same parent + child + released product. Existing persistence tests validate issuance but do not document duplicate suppression. Confirm the desired repeat-measurement policy and add explicit deduplication/idempotency if duplicate active tasks are not intended.
2. Parent accounts have no profile/account-settings route or navigation item. There is no `ParentProfile` / `/parent/profile`, while Student and Teacher/Admin expose profile/password management. If parents are expected to manage their own password/display information, implement that in a separate functional PR.

Consent handling was checked separately: after acceptance, the backend task projection resolves consent and returns the task as launchable.
