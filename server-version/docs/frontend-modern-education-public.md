# Huisurvey Modern Education — Public / Anonymous Experience

Stack base: PR #180 Modern Education foundation.

## Presentation scope

- Public questionnaire entry.
- Public questionnaire focused runner compatibility.
- Public questionnaire result.
- Anonymous public check-in.
- Public cognitive entry.
- Shared public shell/header/read-width treatment.
- Ant Design Card / Button / Input / Result convergence.
- 44px+ legacy questionnaire navigation targets.
- Desktop / Tablet / Mobile responsive composition.

Public Cognitive / Composite focused sessions continue to use the shared runner/report surfaces from PR #180.

## Interaction / logic findings excluded from the visual PR

1. `PublicQuestionnaire.startAssessment` clears `powLoading` immediately after PoW computation but before the `/questionnaires/:token/start` request completes. The entry button can therefore reappear while the first start request is still in flight. A new public start without a resume capability creates a fresh server session and atomically claims another token-use slot, so a repeated click can create another anonymous attempt and consume another quota slot. Add an explicit in-flight lock/loading state covering PoW + start + redirect.
2. In the legacy public questionnaire form-item branch, “内容导航” entries are rendered as `<button>` elements but have no `onClick` handler. They should either become non-interactive progress indicators or receive explicitly supported navigation behavior.

Anonymous public check-in was reviewed separately: the backend serializes upload/submit transitions per session and enforces one submission per `checkinId + sessionId`, so duplicate submit requests do not create a second record.
