-- Research identities have no user, membership, class or relationship binding.
CREATE TABLE anonymous_studies (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120), status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX anonymous_studies_owner_idx ON anonymous_studies(owner_user_id,created_at);
CREATE TABLE anonymous_study_waves (
 id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES anonymous_studies(id) ON DELETE RESTRICT,
 access_token_id TEXT NOT NULL UNIQUE REFERENCES composite_assessment_access_tokens(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120), ordinal INTEGER NOT NULL CHECK(ordinal>0),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(study_id,ordinal), UNIQUE(id,study_id)
);
CREATE TABLE anonymous_study_participants (
 id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES anonymous_studies(id) ON DELETE RESTRICT,
 credential_hash TEXT NOT NULL UNIQUE CHECK(length(credential_hash)=64), display_code TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,study_id), UNIQUE(study_id,display_code)
);
CREATE TABLE anonymous_study_attempts (
 study_id TEXT NOT NULL, wave_id TEXT NOT NULL, participant_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL UNIQUE REFERENCES composite_assessment_attempts(id) ON DELETE RESTRICT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(wave_id,participant_id),
 FOREIGN KEY(wave_id,study_id) REFERENCES anonymous_study_waves(id,study_id) ON DELETE RESTRICT,
 FOREIGN KEY(participant_id,study_id) REFERENCES anonymous_study_participants(id,study_id) ON DELETE RESTRICT
);
CREATE INDEX anonymous_study_attempts_participant_idx ON anonymous_study_attempts(participant_id,created_at);
