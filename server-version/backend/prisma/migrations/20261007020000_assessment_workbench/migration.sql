CREATE TABLE "assessment_composition_templates" (
  "id" TEXT PRIMARY KEY, "owner_id" TEXT NOT NULL, "definition_id" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL, "request_key" TEXT NOT NULL UNIQUE, "request_hash" TEXT NOT NULL,
  "archived_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_composition_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assessment_composition_templates_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "composite_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "assessment_composition_templates_owner_id_created_at_idx" ON "assessment_composition_templates"("owner_id","created_at");
CREATE TABLE "assessment_management_events" (
  "id" TEXT PRIMARY KEY, "actor_id" TEXT NOT NULL, "resource_id" TEXT NOT NULL,
  "action" TEXT NOT NULL, "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_management_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "assessment_management_events_actor_id_created_at_idx" ON "assessment_management_events"("actor_id","created_at");
CREATE TABLE "classroom_end_summaries" (
  "classroom_id" TEXT PRIMARY KEY, "created_by" TEXT NOT NULL,
  "frozen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL, "content_hash" TEXT NOT NULL,
  CONSTRAINT "classroom_end_summaries_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
