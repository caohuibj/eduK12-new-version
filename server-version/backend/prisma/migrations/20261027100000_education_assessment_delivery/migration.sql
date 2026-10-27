-- New delivery metadata only. No tool is approved, granted, published or copied.
-- Existing Scale/Form registries, attempts and content releases are unchanged.
CREATE TABLE education_assessment_deliveries (
 id text PRIMARY KEY,
 product text NOT NULL CHECK (product IN ('SCHOOL','TEACHER')),
 organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 family text NOT NULL CHECK (family IN ('COGNITIVE','SITUATIONAL','BUNDLE')),
 source_composite_id text NOT NULL REFERENCES composite_assessments(id) ON DELETE RESTRICT,
 runtime_composite_id text NOT NULL UNIQUE REFERENCES composite_assessments(id) ON DELETE RESTRICT,
 entry jsonb NOT NULL,
 entry_hash text NOT NULL CHECK (entry_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEWED','PUBLISHED','RETIRED')),
 created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_authority jsonb NOT NULL,
 reviewed_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
 reviewed_at timestamptz,
 reviewed_authority jsonb,
 published_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
 published_at timestamptz,
 published_authority jsonb,
 retired_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
 retired_at timestamptz,
 CHECK ((created_authority->>'actorId'=created_by_user_id) IS TRUE),
 CHECK (reviewed_by_user_id IS NULL OR (reviewed_authority->>'actorId'=reviewed_by_user_id) IS TRUE),
 CHECK (published_by_user_id IS NULL OR (published_authority->>'actorId'=published_by_user_id) IS TRUE),
 CHECK (source_composite_id <> runtime_composite_id),
 CHECK ((entry#>>'{educationOrigin,resourceId}' = id
   AND entry#>>'{educationOrigin,product}' = product
   AND entry#>>'{educationOrigin,organizationId}' = organization_id
   AND entry#>>'{educationOrigin,family}' = family
   AND entry#>>'{educationOrigin,sourceCompositeId}' = source_composite_id
   AND entry#>>'{educationOrigin,runtimeCompositeId}' = runtime_composite_id
   AND entry#>>'{launchTarget,compositeAssessmentId}' = runtime_composite_id) IS TRUE),
 CHECK ((entry->>'releaseStatus' = CASE WHEN status IN ('DRAFT','REVIEWED') THEN 'DRAFT' ELSE 'PUBLISHED' END) IS TRUE),
 CHECK (status = 'DRAFT' OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
   AND reviewed_by_user_id <> created_by_user_id)),
 CHECK (status NOT IN ('PUBLISHED','RETIRED') OR (published_by_user_id IS NOT NULL AND published_at IS NOT NULL)),
 CHECK (status <> 'RETIRED' OR (retired_by_user_id IS NOT NULL AND retired_at IS NOT NULL))
);
CREATE INDEX education_assessment_delivery_catalog_idx ON education_assessment_deliveries(organization_id,product,status,id);

CREATE FUNCTION protect_education_assessment_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'DRAFT' OR NEW.reviewed_by_user_id IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_authority IS NOT NULL
     OR NEW.published_by_user_id IS NOT NULL OR NEW.published_at IS NOT NULL OR NEW.published_authority IS NOT NULL
     OR NEW.retired_by_user_id IS NOT NULL OR NEW.retired_at IS NOT NULL THEN
     RAISE EXCEPTION 'Education delivery must begin as an unapproved draft';
   END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Education delivery history is immutable'; END IF;
 IF (NEW.id,NEW.product,NEW.organization_id,NEW.family,NEW.source_composite_id,NEW.runtime_composite_id,
     NEW.created_by_user_id,NEW.created_at,NEW.created_authority) IS DISTINCT FROM
    (OLD.id,OLD.product,OLD.organization_id,OLD.family,OLD.source_composite_id,OLD.runtime_composite_id,
     OLD.created_by_user_id,OLD.created_at,OLD.created_authority)
    OR (NEW.entry - 'releaseStatus') IS DISTINCT FROM (OLD.entry - 'releaseStatus') THEN
   RAISE EXCEPTION 'Education delivery identity is immutable; create a new version';
 END IF;
 IF NOT ((OLD.status='DRAFT' AND NEW.status='REVIEWED')
   OR (OLD.status='REVIEWED' AND NEW.status='PUBLISHED')
   OR (OLD.status='PUBLISHED' AND NEW.status='RETIRED')) THEN
   RAISE EXCEPTION 'Invalid education delivery transition';
 END IF;
 IF OLD.status<>'DRAFT' AND (NEW.reviewed_by_user_id,NEW.reviewed_at,NEW.reviewed_authority) IS DISTINCT FROM (OLD.reviewed_by_user_id,OLD.reviewed_at,OLD.reviewed_authority) THEN
   RAISE EXCEPTION 'Original education delivery review is immutable';
 END IF;
 IF OLD.status='PUBLISHED' AND (NEW.published_by_user_id,NEW.published_at,NEW.published_authority) IS DISTINCT FROM (OLD.published_by_user_id,OLD.published_at,OLD.published_authority) THEN
   RAISE EXCEPTION 'Original education delivery publication is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER education_assessment_delivery_identity BEFORE INSERT OR UPDATE OR DELETE ON education_assessment_deliveries
 FOR EACH ROW EXECUTE FUNCTION protect_education_assessment_delivery();
