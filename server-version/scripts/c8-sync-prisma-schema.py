from pathlib import Path

p = Path('server-version/backend/prisma/schema.prisma')
s = p.read_text()
if 'model RelationalAssessmentAssignment {' in s:
    raise SystemExit(0)

old_user = '''  attemptConsentsAsSubject      AssessmentAttemptConsent[]  @relation("ConsentSubject")
  attemptConsentsAsRespondent   AssessmentAttemptConsent[]  @relation("ConsentRespondent")
  safetyCasesAsSubject          SafetyCase[]                @relation("SafetyCaseSubject")'''
new_user = '''  attemptConsentsAsSubject      AssessmentAttemptConsent[]  @relation("ConsentSubject")
  attemptConsentsAsRespondent   AssessmentAttemptConsent[]  @relation("ConsentRespondent")
  relationalAssignmentsAsSubject    RelationalAssessmentAssignment[] @relation("RelationalAssignmentSubject")
  relationalAssignmentsAsRespondent RelationalAssessmentAssignment[] @relation("RelationalAssignmentRespondent")
  relationalAssignmentsCreated      RelationalAssessmentAssignment[] @relation("RelationalAssignmentCreator")
  relationalAnalysisSnapshotsAsSubject RelationalAnalysisSnapshot[] @relation("RelationalAnalysisSubject")
  safetyCasesAsSubject          SafetyCase[]                @relation("SafetyCaseSubject")'''
if old_user not in s:
    raise SystemExit('User relation anchor not found')
s = s.replace(old_user, new_user, 1)

old_episode = '''  assessments Assessment[]
  compositeAttempts CompositeAssessmentAttempt[]

  @@index([subjectUserId, createdAt])'''
new_episode = '''  assessments Assessment[]
  compositeAttempts CompositeAssessmentAttempt[]
  relationalAssignments RelationalAssessmentAssignment[]

  @@index([subjectUserId, createdAt])'''
if old_episode not in s:
    raise SystemExit('AssessmentEpisode anchor not found')
s = s.replace(old_episode, new_episode, 1)

old_consent = '''model AssessmentAttemptConsent {
  id                 String   @id @default(uuid())
  subjectUserId      String?  @map("subject_user_id")
  respondentUserId   String?  @map("respondent_user_id")
  respondentType     String   @map("respondent_type")
  consentVersion     String   @map("consent_version")
  consentHash        String   @map("consent_hash")
  purpose            String
  visibilityScope    String   @map("visibility_scope")
  shareTargetsJson   Json?    @map("share_targets_json")
  acceptedAt         DateTime @map("accepted_at")
  revokedAt          DateTime? @map("revoked_at")
  createdAt          DateTime @default(now()) @map("created_at")

  subject    User? @relation("ConsentSubject", fields: [subjectUserId], references: [id], onDelete: Restrict)
  respondent User? @relation("ConsentRespondent", fields: [respondentUserId], references: [id], onDelete: Restrict)
  assessments Assessment[]
  compositeAttempts CompositeAssessmentAttempt[]

  @@index([subjectUserId, acceptedAt])
  @@index([respondentUserId, acceptedAt])
  @@map("assessment_attempt_consents")
}
'''
new_consent = '''model AssessmentAttemptConsent {
  id                 String   @id @default(uuid())
  priorConsentId     String?  @unique(map: "assessment_attempt_consents_prior_consent_id_key") @map("prior_consent_id")
  subjectUserId      String?  @map("subject_user_id")
  respondentUserId   String?  @map("respondent_user_id")
  respondentType     String   @map("respondent_type")
  consentVersion     String   @map("consent_version")
  consentHash        String   @map("consent_hash")
  purpose            String
  visibilityScope    String   @map("visibility_scope")
  shareTargetsJson   Json?    @map("share_targets_json")
  acceptedAt         DateTime? @map("accepted_at")
  revokedAt          DateTime? @map("revoked_at")
  createdAt          DateTime @default(now()) @map("created_at")

  subject    User? @relation("ConsentSubject", fields: [subjectUserId], references: [id], onDelete: Restrict)
  respondent User? @relation("ConsentRespondent", fields: [respondentUserId], references: [id], onDelete: Restrict)
  priorConsent AssessmentAttemptConsent? @relation("ConsentLineage", fields: [priorConsentId], references: [id], onDelete: Restrict)
  supersedingConsent AssessmentAttemptConsent? @relation("ConsentLineage")
  assessments Assessment[]
  compositeAttempts CompositeAssessmentAttempt[]
  relationalAssignments RelationalAssessmentAssignment[]

  @@index([subjectUserId, acceptedAt])
  @@index([respondentUserId, acceptedAt])
  @@map("assessment_attempt_consents")
}

model RelationalAssessmentAssignment {
  id                       String   @id
  episodeId                String   @map("episode_id")
  subjectUserId            String   @map("subject_user_id")
  subjectRole              String   @map("subject_role")
  respondentUserId         String   @map("respondent_user_id")
  respondentRole           String   @map("respondent_role")
  createdByUserId          String   @map("created_by_user_id")
  relationshipKind         String   @map("relationship_kind")
  relationshipRef          String?  @map("relationship_ref")
  relationshipSnapshotJson Json     @map("relationship_snapshot_json")
  relationshipSnapshotHash String   @map("relationship_snapshot_hash")
  perspective              String
  resourceKind             String   @map("resource_kind")
  resourceKey              String   @map("resource_key")
  resourceVersion          String   @map("resource_version")
  applicabilityHash        String?  @map("applicability_hash")
  analysisMode             String?  @map("analysis_mode")
  minimumRespondents       Int?     @map("minimum_respondents")
  consentId                String?  @map("consent_id")
  visibilityPolicyKey      String   @map("visibility_policy_key")
  status                   String   @default("OPEN")
  createdAt                DateTime @default(now()) @map("created_at")
  updatedAt                DateTime @updatedAt @map("updated_at")
  startedAt                DateTime? @map("started_at")
  completedAt              DateTime? @map("completed_at")
  revokedAt                DateTime? @map("revoked_at")

  episode    AssessmentEpisode         @relation(fields: [episodeId], references: [id], onDelete: Restrict)
  subject    User                      @relation("RelationalAssignmentSubject", fields: [subjectUserId], references: [id], onDelete: Restrict)
  respondent User                      @relation("RelationalAssignmentRespondent", fields: [respondentUserId], references: [id], onDelete: Restrict)
  creator    User                      @relation("RelationalAssignmentCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)
  consent    AssessmentAttemptConsent? @relation(fields: [consentId], references: [id], onDelete: Restrict)

  @@unique([episodeId, respondentUserId, resourceKind, resourceKey, resourceVersion], map: "relational_assignment_episode_respondent_resource_key")
  @@index([respondentUserId, status], map: "relational_assignment_respondent_status_idx")
  @@index([subjectUserId, status], map: "relational_assignment_subject_status_idx")
  @@index([episodeId], map: "relational_assignment_episode_idx")
  @@index([relationshipKind, relationshipRef], map: "relational_assignment_relationship_ref_idx")
  @@index([subjectUserId, episodeId, resourceKind, resourceKey, resourceVersion, status], map: "relational_assignment_cohort_scope_idx")
  @@map("relational_assessment_assignments")
}

model RelationalAnalysisSnapshot {
  id                    String   @id
  subjectUserId         String   @map("subject_user_id")
  resourceKind          String   @map("resource_kind")
  resourceKey           String   @map("resource_key")
  resourceVersion       String   @map("resource_version")
  analysisKind          String   @map("analysis_kind")
  policyKey             String   @map("policy_key")
  policyVersion         String   @map("policy_version")
  policyHash            String   @map("policy_hash")
  respondentCount       Int      @map("respondent_count")
  inputResultHashesJson Json     @map("input_result_hashes_json")
  payloadJson           Json     @map("payload_json")
  snapshotHash          String   @unique(map: "relational_analysis_snapshot_hash_key") @map("snapshot_hash")
  createdAt             DateTime @default(now()) @map("created_at")

  subject User @relation("RelationalAnalysisSubject", fields: [subjectUserId], references: [id], onDelete: Restrict)

  @@index([subjectUserId, resourceKind, resourceKey, createdAt(sort: Desc)], map: "relational_analysis_subject_resource_created_idx")
  @@map("relational_analysis_snapshots")
}
'''
if old_consent not in s:
    raise SystemExit('AssessmentAttemptConsent anchor not found')
s = s.replace(old_consent, new_consent, 1)
p.write_text(s)
