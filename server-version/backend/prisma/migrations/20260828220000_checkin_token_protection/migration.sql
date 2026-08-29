ALTER TABLE "checkin_access_tokens"
  ADD COLUMN "token_hash" TEXT,
  ADD COLUMN "token_encrypted" TEXT;

ALTER TABLE "checkin_access_tokens"
  ALTER COLUMN "token" DROP NOT NULL;

CREATE UNIQUE INDEX "checkin_access_tokens_token_hash_key"
  ON "checkin_access_tokens"("token_hash");
