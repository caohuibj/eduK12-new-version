-- CreateTable
CREATE TABLE "participant_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "participant_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_identities_pkey" PRIMARY KEY ("id")
);

-- Add the canonical identity reference while keeping the existing userId
-- column for authorization and historical SetNull behavior.
ALTER TABLE "cognitive_sessions"
ADD COLUMN "participant_identity_id" TEXT;

-- One identity is created for each existing pseudonymous participant key.
-- md5 is used only to produce deterministic text IDs during backfill; new
-- rows use Prisma's normal application-generated UUIDs.
CREATE UNIQUE INDEX "participant_identities_participant_key_key"
ON "participant_identities"("participant_key");

INSERT INTO "participant_identities" (
    "id", "user_id", "participant_key", "created_at", "updated_at"
)
SELECT
    (
      substr(md5('cognitive-participant:' || "participant_key"), 1, 8) || '-' ||
      substr(md5('cognitive-participant:' || "participant_key"), 9, 4) || '-' ||
      substr(md5('cognitive-participant:' || "participant_key"), 13, 4) || '-' ||
      substr(md5('cognitive-participant:' || "participant_key"), 17, 4) || '-' ||
      substr(md5('cognitive-participant:' || "participant_key"), 21, 12)
    ),
    MAX("user_id"),
    "participant_key",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "cognitive_sessions"
GROUP BY "participant_key"
ON CONFLICT ("participant_key") DO NOTHING;

UPDATE "cognitive_sessions" AS session
SET "participant_identity_id" = identity."id"
FROM "participant_identities" AS identity
WHERE identity."participant_key" = session."participant_key";

ALTER TABLE "cognitive_sessions"
ALTER COLUMN "participant_identity_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "participant_identities_user_id_key"
ON "participant_identities"("user_id");

CREATE INDEX "cognitive_sessions_participant_identity_id_status_idx"
ON "cognitive_sessions"("participant_identity_id", "status");

-- AddForeignKey
ALTER TABLE "participant_identities"
ADD CONSTRAINT "participant_identities_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cognitive_sessions"
ADD CONSTRAINT "cognitive_sessions_participant_identity_id_fkey"
FOREIGN KEY ("participant_identity_id") REFERENCES "participant_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
