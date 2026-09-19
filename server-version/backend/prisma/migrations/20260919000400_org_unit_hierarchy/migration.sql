CREATE TABLE "organization_units" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "unit_kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parent_unit_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_units_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_units_kind_check" CHECK ("unit_kind" IN ('GRADE', 'CLASS')),
  CONSTRAINT "organization_units_shape_check" CHECK (
    ("unit_kind" = 'GRADE' AND "parent_unit_id" IS NULL)
    OR ("unit_kind" = 'CLASS' AND "parent_unit_id" IS NOT NULL)
  ),
  CONSTRAINT "organization_units_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_units_org_id_id_key"
  ON "organization_units"("organization_id", "id");

ALTER TABLE "organization_units"
  ADD CONSTRAINT "organization_units_parent_fkey"
  FOREIGN KEY ("organization_id", "parent_unit_id")
  REFERENCES "organization_units"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "organization_units_org_kind_idx"
  ON "organization_units"("organization_id", "unit_kind", "created_at");
CREATE INDEX "organization_units_parent_idx"
  ON "organization_units"("organization_id", "parent_unit_id");

CREATE OR REPLACE FUNCTION organization_unit_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_kind TEXT;
BEGIN
  IF NEW."unit_kind" = 'GRADE' THEN
    IF NEW."parent_unit_id" IS NOT NULL THEN
      RAISE EXCEPTION 'GRADE cannot have parent' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."parent_unit_id" IS NULL OR NEW."parent_unit_id" = NEW."id" THEN
    RAISE EXCEPTION 'CLASS requires a distinct GRADE parent' USING ERRCODE = '23514';
  END IF;

  SELECT u."unit_kind"
    INTO parent_kind
  FROM "organization_units" u
  WHERE u."organization_id" = NEW."organization_id"
    AND u."id" = NEW."parent_unit_id";

  IF parent_kind IS NULL THEN
    RAISE EXCEPTION 'CLASS parent does not exist in organization' USING ERRCODE = '23503';
  END IF;
  IF parent_kind <> 'GRADE' THEN
    RAISE EXCEPTION 'CLASS parent must be GRADE' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "organization_units_parent_guard"
BEFORE INSERT OR UPDATE OF "organization_id", "unit_kind", "parent_unit_id"
ON "organization_units"
FOR EACH ROW
EXECUTE FUNCTION organization_unit_parent_guard();
