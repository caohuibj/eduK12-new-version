# Huisurvey Cognitive Runner Presentation Contract

## Purpose

Cognitive tasks may share presentation primitives for non-timed states without
sharing or rewriting their runtime state machines.

The presentation layer may standardize:

- instruction layout;
- practice-result layout;
- inter-block transition layout;
- formal-completion notice;
- button geometry and hierarchy;
- responsive spacing and typography.

It must not become a task engine.

## Runtime ownership

Each Cognitive task continues to own:

- phase transitions;
- practice pass/fail calculation;
- stimulus sequencing;
- PRNG;
- stimulus onset and offset;
- requestAnimationFrame usage;
- performance/event timestamps;
- pointer and keyboard handlers;
- interruption detection;
- trial payload shape;
- trial persistence;
- task completion.

Shared presentation primitives receive already-resolved values such as
`passed`, `correct`, labels and callbacks. They must not derive scientific
or timing state.

## Initial migration family

The first migration covers non-timed presentation states in:

- CPT;
- CPT frame-timing runner;
- Go/No-Go;
- Go/No-Go frame-timing runner.

Formal stimulus containers remain structurally unchanged in this phase.

CPT inter-block gates may use the shared transition presentation because the
existing task still owns the exact block index, acknowledgement state and
callback.

## Verification split

Visual review and timing review intentionally use different deterministic
evidence.

### UI Lab / Canonical Visual QA

The UI Lab renders static specimens for:

- instruction;
- passed practice result;
- block transition;
- task-complete notice.

These are captured at 390 / 768 / 1440 by the existing UI Lab canonical case.

### Runtime tests

Existing task/timing tests remain authoritative for:

- practice does not persist;
- failed practice does not enter formal;
- ISI timing;
- frame-onset capture;
- keyboard repeat rejection;
- event timestamp handling;
- payload shape;
- block gates.

A visual snapshot must never replace these tests.

## Migration rule

For later task families:

1. migrate only non-timed wrappers first;
2. do not move task state into the shared component;
3. do not change stimulus geometry merely to make tasks visually identical;
4. preserve all labels used by behavioral tests unless the change is explicitly
   presentation-only and the test is updated to an accessible equivalent;
5. if a functional/timing issue is discovered, report it separately and fix it
   in a dedicated logic PR.

## Design direction

Cognitive runner presentation should be:

- calm;
- high-contrast enough for focused tasks;
- sparse;
- touch-accessible;
- keyboard-accessible;
- consistent with Modern Education without decorative distraction.

Practice success/failure presentation must not introduce unsupported claims
about cognitive ability or score quality.
