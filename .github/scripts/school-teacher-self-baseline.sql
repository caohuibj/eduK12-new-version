-- Isolated synthetic row-preservation fixture, exact base 908af20ecfbd3ede55685d2052bf01b52266661c; not login or business-authorization evidence.
BEGIN;
INSERT INTO users (id,username,password_hash,role,account_domain,updated_at) VALUES
('8f761e22-0000-4000-8000-000000000001','hs_migration_fixture','synthetic-not-a-login-hash','ADMIN','SCHOOL','2026-10-22T00:00:00Z');
INSERT INTO organizations (id,name,created_by_user_id,product_domain) VALUES
('8f761e22-0000-4000-8000-000000000002','Synthetic migration school','8f761e22-0000-4000-8000-000000000001','SCHOOL');
INSERT INTO organization_memberships (id,organization_id,user_id,org_role) VALUES
('8f761e22-0000-4000-8000-000000000003','8f761e22-0000-4000-8000-000000000002','8f761e22-0000-4000-8000-000000000001','ORG_ADMIN');
INSERT INTO courses (id,title,course_code,creator_id,course_type,organization_id,status,is_library,is_recruiting,updated_at) VALUES
('8f761e22-0000-4000-8000-000000000004','Synthetic migration preservation','school-teacher-ci-migration','8f761e22-0000-4000-8000-000000000001','CAMPUS_ACTIVITY','8f761e22-0000-4000-8000-000000000002','DRAFT',false,false,'2026-10-22T00:00:00Z');
INSERT INTO campus_activities (course_id,organization_id,owner_membership_id,purpose) VALUES
('8f761e22-0000-4000-8000-000000000004','8f761e22-0000-4000-8000-000000000002','8f761e22-0000-4000-8000-000000000003','STUDENT_WELLBEING');
INSERT INTO education_private_tools(id,entry,organization_id,owner_user_id,kind,title,definition,content_hash)
VALUES('8f761e22-0000-4000-8000-000000000005','SCHOOL','8f761e22-0000-4000-8000-000000000002','8f761e22-0000-4000-8000-000000000001','FORM','Synthetic pre-existing private Form','{"schemaVersion":2,"pages":[{"pageKey":"baseline","title":"Synthetic preserved Form","questions":[{"itemKey":"note","type":"SHORT_TEXT","prompt":"Synthetic preserved question","required":true,"options":[],"rows":[]}]}]}'::jsonb,'8eb6dc8ff0c33f938427acde7de57da85a8796104806db7079824864b3deb47f');
INSERT INTO education_private_tool_versions(id,tool_id,entry,organization_id,owner_user_id,kind,source_revision,title,definition,content_hash)
SELECT '8f761e22-0000-4000-8000-000000000006',id,entry,organization_id,owner_user_id,kind,revision,title,definition,content_hash FROM education_private_tools WHERE id='8f761e22-0000-4000-8000-000000000005';
INSERT INTO users(id,username,password_hash,role,account_domain,teacher_approved,updated_at) VALUES
('8f761e22-0000-4000-8000-000000000007','training_migration_fixture','synthetic-not-a-login-hash','TEACHER','TRAINING',true,'2026-10-28T00:00:00Z');
INSERT INTO composite_assessments(id,code,name,created_by,updated_at) VALUES
('8f761e22-0000-4000-8000-000000000008','synthetic-existing-training-composite','Synthetic native Training draft','8f761e22-0000-4000-8000-000000000007','2026-10-28T00:00:00Z');
COMMIT;
