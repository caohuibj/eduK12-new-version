CREATE UNIQUE INDEX "organization_memberships_org_id_id_user_id_key"
  ON "organization_memberships"("organization_id", "id", "user_id");

CREATE TABLE "assessment_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" TEXT NOT NULL,
  "intake_deadline" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_runs_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','CLOSED','CANCELLED')),
  CONSTRAINT "assessment_runs_version_check" CHECK ("version" >= 1),
  CONSTRAINT "assessment_runs_org_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_runs_creator_fkey" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assessment_runs_org_id_id_key" ON "assessment_runs"("organization_id", "id");
CREATE INDEX "assessment_runs_org_status_idx" ON "assessment_runs"("organization_id", "status", "created_at" DESC);

CREATE TABLE "assessment_run_tracks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "resource_family" TEXT NOT NULL,
  "resource_key" TEXT NOT NULL,
  "resource_version" TEXT NOT NULL,
  "subject_selector" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "respondent_selector" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "requested_policy" JSONB NOT NULL,
  "frozen_resource_policy" JSONB,
  "resource_policy_hash" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_run_tracks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_run_tracks_family_check" CHECK ("resource_family" IN ('BUNDLE','SCALE','FORM','SITUATIONAL','COGNITIVE')),
  CONSTRAINT "assessment_run_tracks_resource_identity_check" CHECK (length(btrim("resource_key")) > 0 AND length(btrim("resource_version")) > 0),
  CONSTRAINT "assessment_run_tracks_run_fkey" FOREIGN KEY ("organization_id", "run_id")
    REFERENCES "assessment_runs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assessment_run_tracks_org_run_id_key" ON "assessment_run_tracks"("organization_id", "run_id", "id");
CREATE INDEX "assessment_run_tracks_run_idx" ON "assessment_run_tracks"("run_id", "created_at");

CREATE TABLE "assessment_run_actor_snapshots" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "provenance_kind" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "membership_id" TEXT,
  "actor_role" TEXT NOT NULL,
  "external_relationship_ref" TEXT,
  "snapshot_payload" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_run_actor_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_run_actor_snapshots_role_check" CHECK ("actor_role" IN ('TEACHER','STUDENT','COUNSELOR','CLIENT','PARENT')),
  CONSTRAINT "assessment_run_actor_snapshots_provenance_check" CHECK (
    ("provenance_kind" = 'ORG_MEMBER' AND "membership_id" IS NOT NULL AND "actor_role" <> 'PARENT' AND "external_relationship_ref" IS NULL)
    OR
    ("provenance_kind" = 'EXTERNAL_PARENT' AND "membership_id" IS NULL AND "actor_role" = 'PARENT' AND "external_relationship_ref" IS NOT NULL)
  ),
  CONSTRAINT "assessment_run_actor_snapshots_run_fkey" FOREIGN KEY ("organization_id", "run_id")
    REFERENCES "assessment_runs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_actor_snapshots_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_actor_snapshots_membership_user_fkey" FOREIGN KEY ("organization_id", "membership_id", "user_id")
    REFERENCES "organization_memberships"("organization_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_actor_snapshots_parent_relation_fkey" FOREIGN KEY ("external_relationship_ref")
    REFERENCES "parent_student_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assessment_run_actor_snapshots_org_run_id_key"
  ON "assessment_run_actor_snapshots"("organization_id", "run_id", "id");
CREATE UNIQUE INDEX "assessment_run_actor_org_member_key"
  ON "assessment_run_actor_snapshots"("run_id", "membership_id", "actor_role")
  WHERE "provenance_kind" = 'ORG_MEMBER';
CREATE UNIQUE INDEX "assessment_run_actor_external_parent_key"
  ON "assessment_run_actor_snapshots"("run_id", "user_id", "external_relationship_ref")
  WHERE "provenance_kind" = 'EXTERNAL_PARENT';

CREATE TABLE "assessment_run_relationship_snapshots" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "relationship_kind" TEXT NOT NULL,
  "relationship_ref" TEXT,
  "subject_actor_snapshot_id" TEXT NOT NULL,
  "respondent_actor_snapshot_id" TEXT NOT NULL,
  "snapshot_payload" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_run_relationship_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_run_relationship_snapshots_run_fkey" FOREIGN KEY ("organization_id", "run_id")
    REFERENCES "assessment_runs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_relationship_snapshots_subject_fkey" FOREIGN KEY ("organization_id", "run_id", "subject_actor_snapshot_id")
    REFERENCES "assessment_run_actor_snapshots"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_relationship_snapshots_respondent_fkey" FOREIGN KEY ("organization_id", "run_id", "respondent_actor_snapshot_id")
    REFERENCES "assessment_run_actor_snapshots"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assessment_run_relationship_snapshots_org_run_id_key"
  ON "assessment_run_relationship_snapshots"("organization_id", "run_id", "id");
CREATE UNIQUE INDEX "assessment_run_relationship_snapshot_identity_key"
  ON "assessment_run_relationship_snapshots"("run_id", "subject_actor_snapshot_id", "respondent_actor_snapshot_id", "relationship_kind", COALESCE("relationship_ref", ''));

CREATE TABLE "assessment_run_executions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "track_id" TEXT NOT NULL,
  "subject_actor_snapshot_id" TEXT NOT NULL,
  "respondent_actor_snapshot_id" TEXT NOT NULL,
  "relationship_snapshot_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "relational_assignment_id" TEXT,
  "runtime_binding_kind" TEXT,
  "runtime_binding_ref" TEXT,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_run_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_run_executions_status_check" CHECK ("status" IN ('ASSIGNED','STARTED','COMPLETED','EXPIRED','REVOKED')),
  CONSTRAINT "assessment_run_executions_binding_shape_check" CHECK (
    ("runtime_binding_ref" IS NULL AND "runtime_binding_kind" IS NULL)
    OR ("runtime_binding_ref" IS NOT NULL AND "runtime_binding_kind" IS NOT NULL)
  ),
  CONSTRAINT "assessment_run_executions_completion_check" CHECK (
    "status" <> 'COMPLETED' OR ("started_at" IS NOT NULL AND "completed_at" IS NOT NULL AND "runtime_binding_ref" IS NOT NULL)
  ),
  CONSTRAINT "assessment_run_executions_run_fkey" FOREIGN KEY ("organization_id", "run_id")
    REFERENCES "assessment_runs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_executions_track_fkey" FOREIGN KEY ("organization_id", "run_id", "track_id")
    REFERENCES "assessment_run_tracks"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_executions_subject_fkey" FOREIGN KEY ("organization_id", "run_id", "subject_actor_snapshot_id")
    REFERENCES "assessment_run_actor_snapshots"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_executions_respondent_fkey" FOREIGN KEY ("organization_id", "run_id", "respondent_actor_snapshot_id")
    REFERENCES "assessment_run_actor_snapshots"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_executions_relationship_fkey" FOREIGN KEY ("organization_id", "run_id", "relationship_snapshot_id")
    REFERENCES "assessment_run_relationship_snapshots"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_run_executions_relational_assignment_fkey" FOREIGN KEY ("relational_assignment_id")
    REFERENCES "relational_assessment_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assessment_run_executions_org_run_id_key"
  ON "assessment_run_executions"("organization_id", "run_id", "id");
CREATE UNIQUE INDEX "assessment_run_execution_forward_key"
  ON "assessment_run_executions"("track_id", "subject_actor_snapshot_id", "respondent_actor_snapshot_id");
CREATE UNIQUE INDEX "assessment_run_execution_runtime_reverse_key"
  ON "assessment_run_executions"("runtime_binding_kind", "runtime_binding_ref")
  WHERE "runtime_binding_ref" IS NOT NULL;
CREATE UNIQUE INDEX "assessment_run_execution_ra_reverse_key"
  ON "assessment_run_executions"("relational_assignment_id")
  WHERE "relational_assignment_id" IS NOT NULL;
CREATE INDEX "assessment_run_executions_run_status_idx"
  ON "assessment_run_executions"("run_id", "status", "created_at");
