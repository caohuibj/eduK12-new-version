# Four-type questionnaire architecture
New questionnaires are CompositeAssessment records with productKind=QUESTIONNAIRE and questionnaireType=COURSE|GENERAL. Existing records default to LEGACY_COMPOSITE. QuestionnaireScale and legacy attempts are never dual-written or migrated.

QuestionnaireCourseDelivery is the authoritative multi-course assignment relation. Cognitive modules reference an owned, published source assignment; at authenticated attempt creation the existing assignment materializer copies its exact frozen profile into the selected eligible delivery course, in the same transaction as the attempt. The session stores that assignment; anonymous sessions use the frozen source without granting course access. The selected deliveryCourseId is recorded on the attempt. Deterministic eligible-course selection is server-side.

Questionnaire authoring uses a dedicated transaction-aware service: row lock + expected revision; child mutations and revision updates commit together. Legacy Composite authoring endpoints reject QUESTIONNAIRE mutations; runtime, token and export endpoints retain established authority. Questionnaire content cannot acquire reportPackage/analysisProtocol semantics, enforced in service and a database CHECK constraint.

Management uses a bounded SQL UNION of legacy Questionnaire and tagged Composite rows, stable createdAt/id order and database pagination. Response links are server-generated. Legacy URLs remain intact; copying to new creates a new ID without converting attempts.

SCALE/COGNITIVE/SITUATIONAL are required. Forms use existing sections/context validation. New questionnaires advertise Web only; the historical native miniprogram is unsupported for this release (see server-version/miniprogram/README.md). Published edits are rejected. New creation can be disabled without disabling existing reads/completions.
