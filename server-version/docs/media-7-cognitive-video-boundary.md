# MEDIA-7 Cognitive Video Adapter Boundary

MEDIA-7 adds non-timing-critical Cognitive video presentation on top of MEDIA-4 without creating a second media runtime.

## In scope

- optional frozen `videos.instruction / videos.example / videos.stimulus` presentation slots;
- MEDIA-4 video/poster/VTT immutable identities retained by the existing Cognitive frozen-runtime owner;
- authenticated or recovery-authorized Cognitive session exchange for short-lived MEDIA-4 native-media capability URLs;
- instruction video presentation before START; example/stimulus delivery delegated to task runners;
- targeted capability refresh for long-running sessions;
- focused adapter regression tests.

## Explicitly out of scope

- media-clock or frame-synchronized reaction-time measurement;
- playback position, watched percentage, `ended`, buffering events, or per-second telemetry in FINAL;
- server playback cursor/timer/state machine;
- new scorer inputs or quality flags derived from video playback;
- Prisma schema changes;
- a new storage/delivery/player implementation;
- production video content publication as part of this adapter PR.

If a future Cognitive task needs a target appearing at video time N to start an RT clock, that must be implemented as a separate Cognitive Timed-Video Protocol with explicit media-clock, buffering-validity and dropped-frame semantics.

## Cross-runtime closeout

The final MEDIA-7 cross-runtime acceptance gate is intentionally deferred until MEDIA-5 Situational Video and MEDIA-6 Scale/Form Video are stable. This branch implements the Cognitive adapter independently; final reconciliation must then verify all four Assessment surfaces against latest `main` before MEDIA-7 is merged as the media-project closeout.
