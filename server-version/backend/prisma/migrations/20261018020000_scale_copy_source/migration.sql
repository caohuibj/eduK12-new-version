-- Additive provenance only. Old readers/writers and frozen definitions remain unchanged.
ALTER TABLE "scales" ADD COLUMN "copy_source" JSONB;
