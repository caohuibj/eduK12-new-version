-- Additive Instrument Authorization overlay for Unified Assessment Bundle commit 9.
-- Append-only audit; evidence assets stay in StoredAsset (admin-readable).

CREATE TABLE "instrument_authorizations" (
    "id" TEXT NOT NULL,
    "authorization_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "instrument_key" TEXT NOT NULL,
    "instrument_version" TEXT NOT NULL,
    "grantor" TEXT NOT NULL,
    "grantee" TEXT NOT NULL,
    "electronic_administration" BOOLEAN NOT NULL DEFAULT true,
    "scoring" BOOLEAN NOT NULL DEFAULT true,
    "translation" BOOLEAN NOT NULL DEFAULT false,
    "display" BOOLEAN NOT NULL DEFAULT true,
    "territories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commercial_nature" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "basis" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidence_asset_id" TEXT,
    "evidence_sha256" TEXT,
    "self_approval_declaration" TEXT,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "record_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instrument_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "instrument_authorization_audits" (
    "id" TEXT NOT NULL,
    "authorization_id" TEXT NOT NULL,
    "authorization_version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "record_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrument_authorization_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "instrument_authorizations_authorization_key_version_key"
  ON "instrument_authorizations"("authorization_key", "version");
CREATE INDEX "instrument_authorizations_instrument_key_instrument_version_status_idx"
  ON "instrument_authorizations"("instrument_key", "instrument_version", "status");
CREATE INDEX "instrument_authorizations_status_valid_to_idx"
  ON "instrument_authorizations"("status", "valid_to");
CREATE INDEX "instrument_authorization_audits_authorization_id_at_idx"
  ON "instrument_authorization_audits"("authorization_id", "at");

ALTER TABLE "instrument_authorizations"
  ADD CONSTRAINT "instrument_authorizations_evidence_asset_id_fkey"
  FOREIGN KEY ("evidence_asset_id") REFERENCES "stored_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "instrument_authorization_audits"
  ADD CONSTRAINT "instrument_authorization_audits_authorization_id_fkey"
  FOREIGN KEY ("authorization_id") REFERENCES "instrument_authorizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
