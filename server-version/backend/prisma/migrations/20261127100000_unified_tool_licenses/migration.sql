-- Separate contract periods from personal grants and frozen task definitions.
CREATE TABLE "tool_licenses" (
  "id" TEXT PRIMARY KEY,
  "product" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "subject_label" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "terminated_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "request_digest" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tool_licenses_valid_period" CHECK ("starts_at" < "expires_at"),
  CONSTRAINT "tool_licenses_subject_product" CHECK (
    ("subject_type" = 'ORGANIZATION' AND "product" IN ('SCHOOL', 'TEACHER'))
    OR ("subject_type" = 'USER' AND "product" IN ('TRAINING', 'SURVEY'))
  )
);
CREATE INDEX "tool_licenses_subject_period_idx" ON "tool_licenses" ("product", "subject_id", "starts_at" DESC);
CREATE INDEX "tool_licenses_product_created_idx" ON "tool_licenses" ("product", "created_at" DESC, "id");

CREATE TABLE "tool_license_items" (
  "license_id" TEXT NOT NULL REFERENCES "tool_licenses" ("id") ON DELETE RESTRICT,
  "tool_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "family" TEXT NOT NULL,
  "usage_limit" INTEGER,
  "used" INTEGER NOT NULL DEFAULT 0,
  "removed_at" TIMESTAMPTZ(6),
  PRIMARY KEY ("license_id", "tool_key"),
  CONSTRAINT "tool_license_items_family" CHECK ("family" IN ('SCALE', 'FORM', 'COGNITIVE', 'SJT', 'COMBINATION', 'BUNDLE')),
  CONSTRAINT "tool_license_items_usage" CHECK ("used" >= 0 AND ("usage_limit" IS NULL OR ("usage_limit" > 0 AND "used" <= "usage_limit")))
);

CREATE TABLE "tool_license_events" (
  "license_id" TEXT NOT NULL REFERENCES "tool_licenses" ("id") ON DELETE RESTRICT,
  "revision" INTEGER NOT NULL,
  "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("license_id", "revision"),
  CONSTRAINT "tool_license_events_action" CHECK ("action" IN ('CREATED', 'UPDATED', 'TERMINATED'))
);

CREATE TABLE "tool_license_charges" (
  "license_id" TEXT NOT NULL,
  "tool_key" TEXT NOT NULL,
  "publication_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "settle_after" TIMESTAMPTZ(6),
  "settled_at" TIMESTAMPTZ(6),
  "released" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("license_id", "tool_key", "publication_id"),
  CONSTRAINT "tool_license_charges_quantity" CHECK ("quantity" > 0 AND "released" BETWEEN 0 AND "quantity"),
  FOREIGN KEY ("license_id", "tool_key") REFERENCES "tool_license_items" ("license_id", "tool_key") ON DELETE RESTRICT
);
CREATE INDEX "tool_license_charges_settlement_idx" ON "tool_license_charges" ("publication_id", "settle_after");
