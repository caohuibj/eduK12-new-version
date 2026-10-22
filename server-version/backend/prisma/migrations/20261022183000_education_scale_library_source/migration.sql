-- Only authoring origin expands. Organization-bound education use grants and
-- all existing immutable application/entry facts keep their current protection.
ALTER TABLE scale_library_submissions
 DROP CONSTRAINT scale_library_submissions_product_check,
 ADD CONSTRAINT scale_library_submissions_product_check
 CHECK (product IN ('TRAINING','SURVEY','SCHOOL','TEACHER'));
