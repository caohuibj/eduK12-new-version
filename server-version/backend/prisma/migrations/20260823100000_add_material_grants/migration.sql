-- Published-scale / cognitive-config grants, plus operational accessPolicy on configs.
CREATE TYPE "MaterialResourceType" AS ENUM ('SCALE', 'COGNITIVE_CONFIG');
CREATE TYPE "CognitiveConfigAccessPolicy" AS ENUM ('OPEN', 'GRANT');

ALTER TABLE "cognitive_test_configs" ADD COLUMN "access_policy" "CognitiveConfigAccessPolicy" NOT NULL DEFAULT 'OPEN';

CREATE TABLE "material_grants" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "resource_type" "MaterialResourceType" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "material_grants_teacher_id_resource_type_resource_id_key" ON "material_grants"("teacher_id", "resource_type", "resource_id");
CREATE INDEX "material_grants_resource_type_resource_id_idx" ON "material_grants"("resource_type", "resource_id");

ALTER TABLE "material_grants" ADD CONSTRAINT "material_grants_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "material_grants" ADD CONSTRAINT "material_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
