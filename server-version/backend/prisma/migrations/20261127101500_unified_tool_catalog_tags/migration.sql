-- Editorial labels on stable, product-scoped commercial tool identities.
CREATE TABLE "tool_catalog_tag_sets" (
  "product" TEXT NOT NULL,
  "tool_key" TEXT NOT NULL,
  "labels" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_by" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("product", "tool_key"),
  CONSTRAINT "tool_catalog_tag_sets_product" CHECK ("product" IN ('SCHOOL', 'TEACHER', 'TRAINING', 'SURVEY')),
  CONSTRAINT "tool_catalog_tag_sets_revision" CHECK ("revision" > 0),
  CONSTRAINT "tool_catalog_tag_sets_labels" CHECK (
    jsonb_typeof("labels") = 'array' AND jsonb_array_length("labels") <= 20
  )
);
