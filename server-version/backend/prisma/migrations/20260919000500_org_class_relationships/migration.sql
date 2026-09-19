CREATE TABLE "organization_student_class_assignments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT TRUE,
  "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_student_class_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_student_class_assignments_interval_check"
    CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
  CONSTRAINT "organization_student_class_assignments_membership_fkey"
    FOREIGN KEY ("organization_id", "membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_student_class_assignments_class_fkey"
    FOREIGN KEY ("organization_id", "class_unit_id")
    REFERENCES "organization_units"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_student_class_active_member_class_key"
  ON "organization_student_class_assignments"("organization_id", "membership_id", "class_unit_id")
  WHERE "valid_until" IS NULL;
CREATE UNIQUE INDEX "organization_student_primary_class_key"
  ON "organization_student_class_assignments"("organization_id", "membership_id")
  WHERE "valid_until" IS NULL AND "is_primary" = TRUE;
CREATE INDEX "organization_student_class_history_idx"
  ON "organization_student_class_assignments"("organization_id", "membership_id", "valid_from" DESC);

CREATE TABLE "organization_staff_class_assignments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "staff_role" TEXT NOT NULL,
  "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_staff_class_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_staff_class_assignments_role_check"
    CHECK ("staff_role" IN ('HOMEROOM', 'TEACHING')),
  CONSTRAINT "organization_staff_class_assignments_interval_check"
    CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
  CONSTRAINT "organization_staff_class_assignments_membership_fkey"
    FOREIGN KEY ("organization_id", "membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_staff_class_assignments_class_fkey"
    FOREIGN KEY ("organization_id", "class_unit_id")
    REFERENCES "organization_units"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_staff_class_current_key"
  ON "organization_staff_class_assignments"("organization_id", "membership_id", "class_unit_id", "staff_role")
  WHERE "valid_until" IS NULL;
CREATE INDEX "organization_staff_class_history_idx"
  ON "organization_staff_class_assignments"("organization_id", "membership_id", "valid_from" DESC);

CREATE OR REPLACE FUNCTION organization_class_relationship_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  class_kind TEXT;
  required_persona TEXT;
  membership_current BOOLEAN;
  persona_current BOOLEAN;
BEGIN
  SELECT u."unit_kind" INTO class_kind
  FROM "organization_units" u
  WHERE u."organization_id" = NEW."organization_id"
    AND u."id" = NEW."class_unit_id";
  IF class_kind IS DISTINCT FROM 'CLASS' THEN
    RAISE EXCEPTION 'relationship target must be CLASS' USING ERRCODE = '23514';
  END IF;

  SELECT (m."valid_until" IS NULL) INTO membership_current
  FROM "organization_memberships" m
  WHERE m."organization_id" = NEW."organization_id"
    AND m."id" = NEW."membership_id";
  IF membership_current IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'relationship requires current membership' USING ERRCODE = '23514';
  END IF;

  required_persona := CASE TG_TABLE_NAME
    WHEN 'organization_student_class_assignments' THEN 'STUDENT'
    WHEN 'organization_staff_class_assignments' THEN 'TEACHER'
    ELSE NULL
  END;
  SELECT EXISTS (
    SELECT 1
    FROM "organization_persona_grants" pg
    WHERE pg."organization_id" = NEW."organization_id"
      AND pg."membership_id" = NEW."membership_id"
      AND pg."persona" = required_persona
      AND pg."revoked_at" IS NULL
  ) INTO persona_current;
  IF persona_current IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'relationship requires current persona %', required_persona USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "organization_student_class_relationship_guard"
BEFORE INSERT OR UPDATE OF "organization_id", "membership_id", "class_unit_id"
ON "organization_student_class_assignments"
FOR EACH ROW EXECUTE FUNCTION organization_class_relationship_guard();

CREATE TRIGGER "organization_staff_class_relationship_guard"
BEFORE INSERT OR UPDATE OF "organization_id", "membership_id", "class_unit_id"
ON "organization_staff_class_assignments"
FOR EACH ROW EXECUTE FUNCTION organization_class_relationship_guard();
