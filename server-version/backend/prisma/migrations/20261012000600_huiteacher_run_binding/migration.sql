-- PR2: bind a Teacher evaluation event to ONE canonical Assessment Run,
-- keeping frozen execution/FINAL in existing shared engine rather than copying
-- evaluation answers or inventing a parallel scoring system.
CREATE TABLE "huiteacher_evaluation_run_links" (
  "organization_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "bound_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "huiteacher_evaluation_run_links_pkey" PRIMARY KEY ("organization_id","event_id"),
  CONSTRAINT "huiteacher_evaluation_run_links_run_key" UNIQUE ("run_id"),
  CONSTRAINT "huiteacher_evaluation_run_links_event_fkey"
    FOREIGN KEY ("organization_id","event_id")
    REFERENCES "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_evaluation_run_links_run_fkey"
    FOREIGN KEY ("organization_id","run_id")
    REFERENCES "assessment_runs"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_evaluation_run_links_actor_fkey"
    FOREIGN KEY ("bound_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "huiteacher_run_links_run_idx" ON "huiteacher_evaluation_run_links"("organization_id","run_id");
