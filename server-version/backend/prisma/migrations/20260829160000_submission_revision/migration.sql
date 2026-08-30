-- Track the version read by a client before a keyed submission.  Existing
-- rows start at zero and are advanced by every controller update; new rows
-- explicitly start at revision one.
ALTER TABLE "submissions"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "checkin_submissions"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
