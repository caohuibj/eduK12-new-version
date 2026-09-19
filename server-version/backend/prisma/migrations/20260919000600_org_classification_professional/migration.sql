CREATE TABLE "organization_classification_dimensions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cardinality" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_classification_dimensions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_classification_dimensions_cardinality_check"
    CHECK ("cardinality" IN ('SINGLE', 'MULTI')),
  CONSTRAINT "organization_classification_dimensions_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_classification_dimensions_org_id_id_key"
  ON "organization_classification_dimensions"("organization_id", "id");
CREATE UNIQUE INDEX "organization_classification_dimensions_org_key_key"
  ON "organization_classification_dimensions"("organization_id", "key");

CREATE TABLE "organization_labels" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "dimension_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_labels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_labels_dimension_fkey"
    FOREIGN KEY ("organization_id", "dimension_id")
    REFERENCES "organization_classification_dimensions"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_labels_org_dimension_id_key"
  ON "organization_labels"("organization_id", "dimension_id", "id");
CREATE UNIQUE INDEX "organization_labels_org_dimension_name_key"
  ON "organization_labels"("organization_id", "dimension_id", "name");

CREATE TABLE "organization_label_assignments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "dimension_id" TEXT NOT NULL,
  "dimension_cardinality" TEXT NOT NULL,
  "label_id" TEXT NOT NULL,
  "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_label_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_label_assignments_cardinality_check"
    CHECK ("dimension_cardinality" IN ('SINGLE', 'MULTI')),
  CONSTRAINT "organization_label_assignments_interval_check"
    CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
  CONSTRAINT "organization_label_assignments_membership_fkey"
    FOREIGN KEY ("organization_id", "membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_label_assignments_label_fkey"
    FOREIGN KEY ("organization_id", "dimension_id", "label_id")
    REFERENCES "organization_labels"("organization_id", "dimension_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_label_assignments_current_label_key"
  ON "organization_label_assignments"("organization_id", "membership_id", "label_id")
  WHERE "valid_until" IS NULL;
CREATE UNIQUE INDEX "organization_label_assignments_single_current_key"
  ON "organization_label_assignments"("organization_id", "membership_id", "dimension_id")
  WHERE "valid_until" IS NULL AND "dimension_cardinality" = 'SINGLE';
CREATE INDEX "organization_label_assignments_history_idx"
  ON "organization_label_assignments"("organization_id", "membership_id", "dimension_id", "valid_from" DESC);

CREATE OR REPLACE FUNCTION organization_label_assignment_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actual_cardinality TEXT;
  membership_current BOOLEAN;
BEGIN
  SELECT d."cardinality" INTO actual_cardinality
  FROM "organization_classification_dimensions" d
  WHERE d."organization_id" = NEW."organization_id"
    AND d."id" = NEW."dimension_id";
  IF actual_cardinality IS NULL THEN
    RAISE EXCEPTION 'classification dimension missing' USING ERRCODE = '23503';
  END IF;
  IF NEW."dimension_cardinality" <> actual_cardinality THEN
    RAISE EXCEPTION 'dimension cardinality mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT (m."valid_until" IS NULL) INTO membership_current
  FROM "organization_memberships" m
  WHERE m."organization_id" = NEW."organization_id"
    AND m."id" = NEW."membership_id";
  IF membership_current IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'label assignment requires current membership' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "organization_label_assignment_guard"
BEFORE INSERT OR UPDATE OF "organization_id", "membership_id", "dimension_id", "dimension_cardinality", "label_id"
ON "organization_label_assignments"
FOR EACH ROW EXECUTE FUNCTION organization_label_assignment_guard();

CREATE TABLE "organization_counselor_client_relationships" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "counselor_membership_id" TEXT NOT NULL,
  "client_membership_id" TEXT NOT NULL,
  "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_counselor_client_relationships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_counselor_client_relationships_distinct_check"
    CHECK ("counselor_membership_id" <> "client_membership_id"),
  CONSTRAINT "organization_counselor_client_relationships_interval_check"
    CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
  CONSTRAINT "organization_counselor_client_relationships_counselor_fkey"
    FOREIGN KEY ("organization_id", "counselor_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_counselor_client_relationships_client_fkey"
    FOREIGN KEY ("organization_id", "client_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_counselor_client_current_key"
  ON "organization_counselor_client_relationships"("organization_id", "counselor_membership_id", "client_membership_id")
  WHERE "valid_until" IS NULL;
CREATE INDEX "organization_counselor_client_counselor_history_idx"
  ON "organization_counselor_client_relationships"("organization_id", "counselor_membership_id", "valid_from" DESC);
CREATE INDEX "organization_counselor_client_client_history_idx"
  ON "organization_counselor_client_relationships"("organization_id", "client_membership_id", "valid_from" DESC);

CREATE OR REPLACE FUNCTION organization_counselor_client_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  counselor_ok BOOLEAN;
  client_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "organization_memberships" m
    JOIN "organization_persona_grants" pg
      ON pg."organization_id" = m."organization_id" AND pg."membership_id" = m."id"
    WHERE m."organization_id" = NEW."organization_id"
      AND m."id" = NEW."counselor_membership_id"
      AND m."valid_until" IS NULL
      AND pg."persona" = 'COUNSELOR' AND pg."revoked_at" IS NULL
  ) INTO counselor_ok;
  SELECT EXISTS (
    SELECT 1 FROM "organization_memberships" m
    JOIN "organization_persona_grants" pg
      ON pg."organization_id" = m."organization_id" AND pg."membership_id" = m."id"
    WHERE m."organization_id" = NEW."organization_id"
      AND m."id" = NEW."client_membership_id"
      AND m."valid_until" IS NULL
      AND pg."persona" = 'CLIENT' AND pg."revoked_at" IS NULL
  ) INTO client_ok;
  IF counselor_ok IS DISTINCT FROM TRUE OR client_ok IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'COUNSELOR_CLIENT requires current COUNSELOR and CLIENT personas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "organization_counselor_client_guard"
BEFORE INSERT OR UPDATE OF "organization_id", "counselor_membership_id", "client_membership_id"
ON "organization_counselor_client_relationships"
FOR EACH ROW EXECUTE FUNCTION organization_counselor_client_guard();
