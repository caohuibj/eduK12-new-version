CREATE INDEX "tool_license_charges_pending_settlement_idx"
ON "tool_license_charges" ("settle_after", "publication_id", "license_id", "tool_key")
WHERE "settle_after" IS NOT NULL AND "settled_at" IS NULL;
