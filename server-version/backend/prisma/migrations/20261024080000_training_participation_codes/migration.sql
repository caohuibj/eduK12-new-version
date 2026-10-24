-- Additive Training adapter for the shared anonymous participation mechanisms.
-- Existing participants, attempts, consent facts and reports are retained.
ALTER TABLE anonymous_studies
 ADD COLUMN participation_revision INTEGER NOT NULL DEFAULT 0 CHECK(participation_revision>=0),
 ADD COLUMN participation_mode TEXT NOT NULL DEFAULT 'PERSONAL_LINK' CHECK(participation_mode IN ('PERSONAL_LINK','MEMORABLE_CODE','SELF_CODE')),
 ADD COLUMN participation_label TEXT NOT NULL DEFAULT '参与编号' CHECK(length(participation_label) BETWEEN 1 AND 40),
 ADD COLUMN participation_instructions TEXT NOT NULL DEFAULT '' CHECK(length(participation_instructions)<=500);
ALTER TABLE anonymous_study_participants ADD COLUMN recovery_generation INTEGER NOT NULL DEFAULT 0 CHECK(recovery_generation>=0);
CREATE TABLE anonymous_study_codes (
 id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES anonymous_studies(id) ON DELETE RESTRICT,
 prefix TEXT NOT NULL CHECK(length(prefix) BETWEEN 1 AND 20), enabled BOOLEAN NOT NULL DEFAULT TRUE,
 participant_id TEXT, credential_version INTEGER NOT NULL DEFAULT 0 CHECK(credential_version>=0),
 previous_credential_hash TEXT CHECK(previous_credential_hash IS NULL OR previous_credential_hash ~ '^[0-9a-f]{64}$'),
 reset_hash TEXT CHECK(reset_hash IS NULL OR reset_hash ~ '^[0-9a-f]{64}$'), reset_expires_at TIMESTAMPTZ,
 FOREIGN KEY(participant_id,study_id) REFERENCES anonymous_study_participants(id,study_id) ON DELETE RESTRICT,
 UNIQUE(study_id,prefix), UNIQUE(participant_id), CHECK((reset_hash IS NULL)=(reset_expires_at IS NULL))
);
CREATE TABLE anonymous_study_participation_events (
 id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES anonymous_studies(id) ON DELETE RESTRICT,
 participant_id TEXT, actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('CONFIGURED','RESET_ISSUED','RESET_COMPLETED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(participant_id,study_id) REFERENCES anonymous_study_participants(id,study_id) ON DELETE RESTRICT
);
CREATE FUNCTION training_participation_mode_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.participation_mode IS DISTINCT FROM OLD.participation_mode AND
 (EXISTS(SELECT 1 FROM anonymous_study_waves WHERE study_id=OLD.id) OR EXISTS(SELECT 1 FROM anonymous_study_participants WHERE study_id=OLD.id))
 THEN RAISE EXCEPTION 'Published participation mode is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_participation_mode_guard BEFORE UPDATE ON anonymous_studies FOR EACH ROW EXECUTE FUNCTION training_participation_mode_guard();
CREATE FUNCTION training_participation_code_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mode TEXT; frozen BOOLEAN;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Participation registry is retained'; END IF;
 SELECT participation_mode INTO mode FROM anonymous_studies WHERE id=NEW.study_id FOR UPDATE;
 SELECT EXISTS(SELECT 1 FROM anonymous_study_waves WHERE study_id=NEW.study_id)
  OR EXISTS(SELECT 1 FROM anonymous_study_participants WHERE study_id=NEW.study_id) INTO frozen;
 IF mode='PERSONAL_LINK' AND NEW.enabled THEN RAISE EXCEPTION 'Personal links have no code registry'; END IF;
 IF TG_OP='INSERT' THEN
  IF mode='MEMORABLE_CODE' AND frozen THEN RAISE EXCEPTION 'Published short-code registry is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.prefix IS DISTINCT FROM OLD.prefix OR
 (OLD.participant_id IS NOT NULL AND (NEW.participant_id IS DISTINCT FROM OLD.participant_id OR NEW.enabled IS DISTINCT FROM OLD.enabled))
 THEN RAISE EXCEPTION 'Claimed participation registry is immutable'; END IF;
 IF mode='MEMORABLE_CODE' AND frozen AND NEW.enabled IS DISTINCT FROM OLD.enabled
 THEN RAISE EXCEPTION 'Published short-code registry is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_participation_code_guard BEFORE INSERT OR UPDATE OR DELETE ON anonymous_study_codes FOR EACH ROW EXECUTE FUNCTION training_participation_code_guard();
CREATE FUNCTION training_participation_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Participation audit events are immutable'; END $$;
CREATE TRIGGER training_participation_events_immutable BEFORE UPDATE OR DELETE ON anonymous_study_participation_events FOR EACH ROW EXECUTE FUNCTION training_participation_events_immutable();
