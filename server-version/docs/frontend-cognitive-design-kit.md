# Huisurvey Cognitive Design Kit

## Purpose

The Cognitive Design Kit gives Cognitive tasks a shared visual language without
turning presentation code into a task engine.

It standardizes only non-timed UI:

- instruction / practice / transition / completion panels;
- response-control geometry;
- progress presentation;
- short hints and key cues;
- touch, focus, spacing and responsive behavior.

## Visual language

Cognitive tasks should remain calm, sparse and task-focused.

- Use the existing Modern Education tokens.
- Keep stimulus/task geometry task-owned.
- Prefer one clear primary action per non-timed state.
- Response controls should be large enough for touch and keyboard use.
- Selected state should be visible without relying on color alone.
- Hints are concise and visually secondary.
- Progress may display values already resolved by the task; it must not decide
  phase advancement or timing.

Cognitive tasks do not need to look identical. Shared presentation establishes
rhythm and interaction affordances, while specialized runners keep their own
stimulus layouts.

## Shared primitives

`CognitiveTaskPresentation.tsx` owns reusable presentation primitives:

- `CognitiveTaskIntro`
- `CognitivePracticeResult`
- `CognitiveTaskTransition`
- `CognitiveTaskCompletionNotice`
- `CognitiveResponseButton`
- `CognitiveProgress`
- `CognitiveHint`

These components receive resolved labels, values and callbacks. They do not
calculate pass/fail, determine the current trial, generate stimuli, advance
blocks, persist trials or derive scientific results.

## Runtime boundary

Remain task-owned and unchanged by this kit:

- phase/state machines;
- practice pass/fail calculation;
- PRNG and stimulus sequence;
- stimulus onset/offset;
- requestAnimationFrame timing;
- performance/event timestamps;
- keyboard/pointer semantics;
- interruption handling;
- trial payloads and persistence;
- scorer/report logic;
- task-package onboarding and publication.

A visual change that requires modifying one of those areas belongs in a
separate logic/timing PR.

## UI Lab

`/__ui-lab` is the review surface for the kit when
`VITE_UI_LAB_ENABLED=true`.

The Cognitive section demonstrates:

- normal / selected / disabled response controls;
- key-cue presentation;
- resolved progress;
- a concise hint;
- intro, practice result, transition and completion states.

The specimens use deterministic illustrative data only and do not call business
APIs.

## Acceptance

Review the UI Lab at 390 × 844, 768 × 1024 and 1440 × 1000.

Check:

- no horizontal overflow;
- touch targets approximately 44 px or larger;
- visible keyboard focus;
- selected state is not color-only;
- mobile controls reflow without clipping;
- reduced-motion presentation remains stable;
- no task/scientific state is inferred by shared presentation code.

Runtime and timing tests remain authoritative for behavioral correctness.
