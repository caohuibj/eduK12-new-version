ALTER TABLE scales ADD COLUMN standard_source_kind text NOT NULL DEFAULT 'CODE_PACKAGE',
 ADD COLUMN standard_tool_key text,
 ADD CONSTRAINT scales_standard_source_kind CHECK(standard_source_kind IN ('CODE_PACKAGE','DB_IMPORTED')),
 ADD CONSTRAINT scales_db_standard_identity CHECK(standard_source_kind<>'DB_IMPORTED' OR
  (instrument_class='STANDARD' AND standard_tool_key IS NOT NULL AND definition IS NOT NULL AND definition_hash IS NOT NULL));
CREATE UNIQUE INDEX scales_db_standard_version ON scales(standard_tool_key,instrument_version) WHERE standard_source_kind='DB_IMPORTED';
CREATE FUNCTION db_imported_standard_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.standard_source_kind='DB_IMPORTED' THEN RAISE EXCEPTION 'Imported C source is retained'; END IF;
  RETURN OLD;
 END IF;
 IF OLD.standard_source_kind='DB_IMPORTED' OR NEW.standard_source_kind='DB_IMPORTED' THEN
  IF ROW(NEW.id,NEW.code,NEW.instrument_class,NEW.instrument_version,NEW.standard_source_kind,NEW.standard_tool_key,NEW.definition,NEW.definition_hash,NEW.creator_id,NEW.instruction)
   IS DISTINCT FROM ROW(OLD.id,OLD.code,OLD.instrument_class,OLD.instrument_version,OLD.standard_source_kind,OLD.standard_tool_key,OLD.definition,OLD.definition_hash,OLD.creator_id,OLD.instruction)
   THEN RAISE EXCEPTION 'Imported C identity and definition are frozen'; END IF;
  IF OLD.status<>'PUBLISHED' AND NEW.status='PUBLISHED' AND NOT EXISTS(
   SELECT 1 FROM survey_standard_releases r WHERE r.state='ONLINE'
    AND r.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,scaleId}'=NEW.id
    AND r.tool_key=NEW.standard_tool_key AND r.snapshot->>'instrumentVersion'=NEW.instrument_version)
   THEN RAISE EXCEPTION 'Imported C requires an online combination'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER db_imported_standard_frozen BEFORE UPDATE OR DELETE ON scales FOR EACH ROW EXECUTE FUNCTION db_imported_standard_frozen();
