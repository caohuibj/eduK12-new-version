ALTER TYPE "AssessmentEpisodeInitiationMode" ADD VALUE IF NOT EXISTS 'ORGANIZATION_RUN';

CREATE TABLE "organization_episode_allocations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "track_id" TEXT NOT NULL,
  "subject_actor_snapshot_id" TEXT NOT NULL,
  "assessment_episode_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_episode_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_episode_allocations_run_fkey"
    FOREIGN KEY ("organization_id", "run_id")
    REFERENCES "assessment_runs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_episode_allocations_track_fkey"
    FOREIGN KEY ("organization_id", "run_id", "track_id")
    REFERENCES "assessment_run_tracks"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_episode_allocations_subject_fkey"
    FOREIGN KEY ("organization_id", "run_id", "subject_actor_snapshot_id")
    REFERENCES "assessment_run_actor_snapshots"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_episode_allocations_episode_fkey"
    FOREIGN KEY ("assessment_episode_id")
    REFERENCES "assessment_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_episode_allocation_subject_track_key"
  ON "organization_episode_allocations"("run_id", "track_id", "subject_actor_snapshot_id");
CREATE UNIQUE INDEX "organization_episode_allocation_episode_key"
  ON "organization_episode_allocations"("assessment_episode_id");
CREATE INDEX "organization_episode_allocations_run_idx"
  ON "organization_episode_allocations"("run_id", "track_id", "created_at");

CREATE OR REPLACE FUNCTION organization_episode_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_user_id TEXT;
  episode_subject_user_id TEXT;
  episode_mode TEXT;
  episode_course_id TEXT;
BEGIN
  SELECT a."user_id"
    INTO actor_user_id
  FROM "assessment_run_actor_snapshots" a
  WHERE a."organization_id" = NEW."organization_id"
    AND a."run_id" = NEW."run_id"
    AND a."id" = NEW."subject_actor_snapshot_id";

  SELECT e."subject_user_id", e."initiation_mode"::text, e."course_id"
    INTO episode_subject_user_id, episode_mode, episode_course_id
  FROM "assessment_episodes" e
  WHERE e."id" = NEW."assessment_episode_id";

  IF actor_user_id IS NULL OR episode_subject_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'organization episode subject must equal frozen subject actor' USING ERRCODE = '23514';
  END IF;
  IF episode_mode IS DISTINCT FROM 'ORGANIZATION_RUN' THEN
    RAISE EXCEPTION 'organization allocation requires ORGANIZATION_RUN episode' USING ERRCODE = '23514';
  END IF;
  IF episode_course_id IS NOT NULL THEN
    RAISE EXCEPTION 'organization run episode cannot impersonate course scope' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "organization_episode_allocation_guard"
BEFORE INSERT OR UPDATE OF "organization_id", "run_id", "track_id", "subject_actor_snapshot_id", "assessment_episode_id"
ON "organization_episode_allocations"
FOR EACH ROW EXECUTE FUNCTION organization_episode_allocation_guard();
