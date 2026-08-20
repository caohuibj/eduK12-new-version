-- AlterTable
ALTER TABLE "cognitive_sessions" DROP COLUMN "participant_snapshot",
ADD COLUMN     "participant_snapshot_encrypted" TEXT,
ALTER COLUMN "config_snapshot_encrypted" SET NOT NULL,
ALTER COLUMN "random_seed" SET NOT NULL;

