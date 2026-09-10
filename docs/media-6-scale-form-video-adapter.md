# MEDIA-6 — Scale + Form Video Adapter

## Scope

Thin R1 adapters on top of MEDIA-4 Universal Video Core.

- Scale: optional per-item `video` presentation.
- Form / Questionnaire: optional per-choice `video` presentation beside the existing option value/label/image metadata.
- Reuse MEDIA-4 `AssessmentVideoPresentationV1`, capability issuance, Range delivery and `AssessmentVideoPlayer`.
- Reuse MEDIA-2 publication/frozen retention owners and authenticated/public recovery seams.

## Hard boundaries

- Prisma migration: 0.
- Unified FINAL: 0 semantic diff.
- CanonicalUnitResult: 0.
- Bundle finalizer: 0.
- Scale/Form scoring and response validation: unchanged.
- No second media runtime/service.
- No per-item server cursor or video-progress durable writes.
- No autoplay-as-measurement semantics in generic media.
- No rich-content DSL or authoring UI in this PR.

## Adapter semantics

Frozen video identity consists only of the actual presentation assets already modeled by MEDIA-4: video plus optional poster and VTT captions, together with transcript/title/description presentation metadata. Scale/Form answer values remain the authoritative response plane and never derive from playback state.

Scale and Form adapters may block answer interaction while a required declared video is unavailable, but playback position, completion percentage and watch time are not persisted or scored by this PR.

## Merge ordering

MEDIA-6 may develop in parallel with MEDIA-5 and MEDIA-7. MEDIA-7's final cross-runtime acceptance/merge remains after MEDIA-6 is stable so the final media gate can exercise all runtime adapters together.
