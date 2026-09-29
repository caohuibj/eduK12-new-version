# Huisurvey Modern Education — Live Classroom Presentation

Stack base: PR #180 Modern Education foundation.

## Presentation scope

Presentation-only convergence for:

- classroom creation and basic editing
- classroom question authoring
- teacher realtime control / history / QR entry points
- classroom QR presentation
- six-digit classroom-code entry
- classroom join / waiting state
- real-time student answer surface
- authenticated Student and guest Public classroom participants
- Desktop / Tablet / Mobile composition

PR10B uses existing Product / Staff primitives plus classroom-local CSS and lightweight JSX wrappers. It does not alter the Classroom realtime contract.

The following remain runtime-owned and unchanged:

- `useClassroomSocket` connection and subscription behavior
- `teacher:start`, `teacher:end`, `teacher:next`, `teacher:close`
- `student:submit`
- current-question ownership and question sequence
- question timers and server-authoritative timestamps
- room-code / join / attendance authority
- Socket.IO ACK and server-result handling

Responsive details:

- Teacher authoring surfaces use the same Staff panels, fields, status and action hierarchy as the rest of the management UI.
- Teacher control moves from a legacy dashboard shell to a responsive control + question-list composition without changing event handlers.
- QR presentation constrains the canvas to narrow screens while retaining the existing generated value and download behavior.
- Nested full-screen classroom participant surfaces are constrained to the application viewport instead of creating page-level overflow.
- The six classroom-code cells shrink as a group on narrow phones so all six remain on one row.
- Screen keypad and primary entry actions retain 44px+ touch targets.
- Real-time option buttons, text inputs and submission actions remain full-width and thumb-friendly.
- Safe-area-aware shell padding is inherited from the parent application shell.

## Interaction / logic findings excluded from the visual PR

1. `ClassroomAnswer` still uses native `alert()` for classroom closure, Socket errors, and some expired-submit states. Replace these with in-page live status presentation in a dedicated interaction PR.
2. `ClassroomAnswer` does not set a local submission-in-flight lock after emitting `student:submit`; the Submit button remains available until the server emits `student:submitted`. The backend database uniqueness constraint prevents duplicate answer records and returns “您已提交过答案” on a duplicate create, but rapid repeated clicks can still generate avoidable Socket errors. Add a local pending state without changing server uniqueness semantics.
3. Native `alert()` / `confirm()` behavior in Classroom Edit and Question Edit remains unchanged in this visual PR.

## Display-mode note

The teacher BigScreen route is intentionally excluded from this responsive application theme. It is a dedicated projector/display surface with its own high-contrast layout and should be reviewed as a separate display-mode system rather than forced into phone/tablet application rules.
