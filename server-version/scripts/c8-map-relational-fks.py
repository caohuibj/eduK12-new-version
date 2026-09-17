from pathlib import Path

p = Path('server-version/backend/prisma/schema.prisma')
s = p.read_text()
replacements = {
'''  priorConsent AssessmentAttemptConsent? @relation("ConsentLineage", fields: [priorConsentId], references: [id], onDelete: Restrict)''':
'''  priorConsent AssessmentAttemptConsent? @relation("ConsentLineage", fields: [priorConsentId], references: [id], onDelete: Restrict, map: "assessment_attempt_consents_prior_consent_id_fkey")''',
'''  episode    AssessmentEpisode         @relation(fields: [episodeId], references: [id], onDelete: Restrict)''':
'''  episode    AssessmentEpisode         @relation(fields: [episodeId], references: [id], onDelete: Restrict, map: "relational_assignment_episode_fkey")''',
'''  subject    User                      @relation("RelationalAssignmentSubject", fields: [subjectUserId], references: [id], onDelete: Restrict)''':
'''  subject    User                      @relation("RelationalAssignmentSubject", fields: [subjectUserId], references: [id], onDelete: Restrict, map: "relational_assignment_subject_fkey")''',
'''  respondent User                      @relation("RelationalAssignmentRespondent", fields: [respondentUserId], references: [id], onDelete: Restrict)''':
'''  respondent User                      @relation("RelationalAssignmentRespondent", fields: [respondentUserId], references: [id], onDelete: Restrict, map: "relational_assignment_respondent_fkey")''',
'''  creator    User                      @relation("RelationalAssignmentCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)''':
'''  creator    User                      @relation("RelationalAssignmentCreator", fields: [createdByUserId], references: [id], onDelete: Restrict, map: "relational_assignment_created_by_fkey")''',
'''  consent    AssessmentAttemptConsent? @relation(fields: [consentId], references: [id], onDelete: Restrict)''':
'''  consent    AssessmentAttemptConsent? @relation(fields: [consentId], references: [id], onDelete: Restrict, map: "relational_assignment_consent_fkey")''',
'''  subject User @relation("RelationalAnalysisSubject", fields: [subjectUserId], references: [id], onDelete: Restrict)''':
'''  subject User @relation("RelationalAnalysisSubject", fields: [subjectUserId], references: [id], onDelete: Restrict, map: "relational_analysis_subject_fkey")''',
}
for old, new in replacements.items():
    if new in s:
        continue
    if old not in s:
        raise SystemExit(f'anchor not found: {old}')
    s = s.replace(old, new, 1)
p.write_text(s)
