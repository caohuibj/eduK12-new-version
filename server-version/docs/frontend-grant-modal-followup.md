# Grant loading and frequent modal follow-up

Grant replacement previously remained available when a teacher/grant read failed or returned an incomplete response. A replacement with an empty selection could therefore remove existing grants. Both reads must now succeed with complete lists before editing or saving is enabled. Read failures have an explicit retry action; save failures preserve the selection. Resource changes remount the editor, stale reads are ignored, and completed writes for an unmounted editor cannot dismiss another resource. While saving, selection, repeat saves, cancellation and dismissal are locked.

The existing replacement endpoint and eligibility rules are unchanged. Previously granted teachers absent from the eligible picker remain in the payload. An intentional empty selection after successful loading still clears grants. Truncated or changing teacher pagination fails visibly instead of presenting a partial directory.

Seven frequent overlays now use the existing native `ModalSurface`: assignment editor, submission list and batch feedback; check-in editor and submission list; course editor and sharing. Their existing forms, submission handlers and cancellation cleanup remain intact. Escape closes the topmost dialog, background interaction is blocked, and closing a child restores focus to its parent control. Batch feedback retains its existing no-dismissal policy while submitting.

`DocumentSelector.tsx` had no imports or runtime entry points anywhere in the repository and duplicated the active `MediaSelector` document flow. The unused component was removed; shared document types, viewing, upload and download behavior remain intact. Browser checks exercise the active document selector from both assignment and check-in editors.

## Verification

- Frontend: 156 test files / 616 tests passed. Includes 14 grant-modal tests and 9 grant API tests covering failed/incomplete reads, retries, intentional revocation, preserved hidden grants, stale resources and in-flight writes; stacked-dialog tests cover simultaneous unmount and closing the lower dialog first.
- Typecheck and production build passed; lint has no errors (117 existing warnings).
- The interaction browser matrix covers 360, 390, 768 and 1440 px, including grant failure/retry, all seven migrated dialogs, nested document selection and batch feedback, focus containment/restoration, background isolation and scroll unlock. All endpoints are deterministic read-only fixtures.
- Backend authorization, assessment scoring, timing, stimuli and reporting semantics are unchanged.

The remaining lower-frequency legacy overlays and additional browser/screen-reader combinations are outside this bounded migration. This follow-up does not implement cross-course task aggregation.
