# Huisurvey Modern Education — Legacy Surface Migration

## Scope

This PR removes the most visible “two generations of UI” problem from high-frequency Staff/Admin pages.

Migrated families:

- Scale editor
- General Questionnaire list / create / edit
- Cognitive assignment list / edit
- Composite assessment list / edit
- Material grants
- Instrument authorization
- Image / Video / Document libraries
- Teacher code management

## Component model

The migrated pages now converge on the existing semantic layers:

- ProductPage / PageHeader / ProductStatus
- Product button classes / ProductButton
- Staff panel / form / empty / table / dialog primitives
- Staff segmented navigation
- Staff feedback / management dialog where already available

The PR intentionally does not introduce a new design library.

## Behavioral boundary

No API endpoint, route, authorization rule, assessment runtime, export contract, scoring rule or publication state machine is changed.

Where a page had existing confirmation/message behavior, migration keeps the same operation order and endpoint contract.

## Responsive behavior

Desktop:
- management width and dense tables remain productivity-first;
- editor primary/secondary actions live in the PageHeader action hierarchy.

Tablet:
- form grids collapse naturally;
- tables retain local horizontal scrolling.

Mobile:
- editor/form grids become single-column;
- toolbar and inline action groups become full-width where needed;
- destructive/edit actions remain visible without hover;
- dialogs and panels preserve existing safe-area rules.

## Acceptance

- no target page retains raw global `.card` or `btn-primary/btn-secondary/btn-danger` as its primary surface model;
- General Questionnaire List/Create no longer depend on Ant Design components;
- Scale/Cognitive/Composite editors use the same PageHeader/action hierarchy;
- management tables use Staff table primitives;
- 390 / 768 / 1440 canonical visual QA passes;
- frontend lint/typecheck/tests/build pass;
- no page-level horizontal overflow;
- no API/route/domain behavior change.
