CREATE TABLE "scale_deployment_policies" (
  "id" UUID NOT NULL,
  "scale_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "policy_json" JSONB NOT NULL,
  "policy_hash" TEXT NOT NULL,
  "authorization_refs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activated_at" TIMESTAMPTZ(6),
  "retired_at" TIMESTAMPTZ(6),

  CONSTRAINT "scale_deployment_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scale_deployment_policies_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  CONSTRAINT "scale_deployment_policies_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "scale_deployment_policies_policy_hash_check" CHECK ("policy_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "scale_deployment_policies_scale_revision_key" UNIQUE ("scale_id", "revision"),
  CONSTRAINT "scale_deployment_policies_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "scale_deployment_policies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "scale_deployment_policies_one_active_per_scale_idx"
  ON "scale_deployment_policies" ("scale_id")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "scale_deployment_policies_status_created_idx"
  ON "scale_deployment_policies" ("status", "created_at" DESC);
