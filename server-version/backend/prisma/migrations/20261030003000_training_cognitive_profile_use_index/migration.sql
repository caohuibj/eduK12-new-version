-- Exact typed history is consulted before legacy OPEN/ADMIN/resourceId paths.
CREATE INDEX training_cognitive_profile_use_identity ON assessment_management_events(resource_id,((metadata->>'userId')))
 WHERE action='TRAINING_COGNITIVE_PROFILE_USE_GRANTED';
