-- No existing relationship, grant or frozen report is rewritten.
DROP INDEX "parent_student_relationships_parent_user_id_student_user_id_key";
CREATE UNIQUE INDEX "parent_relationship_current_pair_key" ON "parent_student_relationships" ("parent_user_id", "student_user_id") WHERE "status" IN ('PENDING', 'ACTIVE');
CREATE INDEX "parent_relationship_pair_history_idx" ON "parent_student_relationships" ("parent_user_id", "student_user_id", "created_at" DESC);
ALTER TABLE "parent_invite_codes" ALTER COLUMN "course_id" DROP NOT NULL;
ALTER TABLE "parent_invite_codes" ADD COLUMN "organization_id" TEXT, ADD COLUMN "membership_id" TEXT;
ALTER TABLE "parent_invite_codes" ADD CONSTRAINT "parent_invite_source_check" CHECK (
  ("course_id" IS NOT NULL AND "organization_id" IS NULL AND "membership_id" IS NULL) OR
  ("course_id" IS NULL AND "organization_id" IS NOT NULL AND "membership_id" IS NOT NULL)
);
ALTER TABLE "parent_invite_codes" ADD CONSTRAINT "parent_invite_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "parent_invite_codes" ADD CONSTRAINT "parent_invite_membership_fkey" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT;
