-- Additive, SQL-owned personnel staging. No accounts/grants are backfilled.
CREATE TABLE campus_personnel_import_batches (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 request_hash TEXT NOT NULL, receipt JSONB NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(organization_id,id)
);
CREATE TABLE campus_personnel (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('STUDENT','STAFF')),
 number_digest TEXT NOT NULL, profile_cipher TEXT NOT NULL,
 persona TEXT NOT NULL CHECK(persona IN ('STUDENT','TEACHER','COUNSELOR')),
 class_unit_id TEXT, eligibility_id TEXT UNIQUE REFERENCES campus_student_eligibilities(id) ON DELETE RESTRICT,
 expected_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 claimed_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 batch_id TEXT NOT NULL REFERENCES campus_personnel_import_batches(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(organization_id,kind,number_digest), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,class_unit_id) REFERENCES organization_units(organization_id,id) ON DELETE RESTRICT,
 CHECK((kind='STUDENT' AND persona='STUDENT' AND class_unit_id IS NOT NULL AND eligibility_id IS NOT NULL)
    OR (kind='STAFF' AND persona IN ('TEACHER','COUNSELOR') AND class_unit_id IS NULL AND eligibility_id IS NULL))
);
CREATE UNIQUE INDEX campus_personnel_claimed_key ON campus_personnel(organization_id,kind,claimed_user_id)
 WHERE claimed_user_id IS NOT NULL;
CREATE UNIQUE INDEX campus_personnel_expected_key ON campus_personnel(organization_id,kind,expected_user_id)
 WHERE expected_user_id IS NOT NULL;
CREATE TABLE campus_personnel_assignments (
 organization_id TEXT NOT NULL, person_id TEXT NOT NULL, class_unit_id TEXT NOT NULL,
 staff_role TEXT NOT NULL CHECK(staff_role IN ('HOMEROOM','TEACHING')),
 PRIMARY KEY(person_id,class_unit_id,staff_role),
 FOREIGN KEY(organization_id,person_id) REFERENCES campus_personnel(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,class_unit_id) REFERENCES organization_units(organization_id,id) ON DELETE RESTRICT
);
CREATE TABLE campus_personnel_credentials (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, person_id TEXT NOT NULL,
 student_code_id TEXT UNIQUE REFERENCES campus_activation_codes(id) ON DELETE RESTRICT,
 staff_invitation_id TEXT UNIQUE REFERENCES campus_staff_invitations(id) ON DELETE RESTRICT,
 issued_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 revoked_at TIMESTAMPTZ(6), created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(organization_id,person_id) REFERENCES campus_personnel(organization_id,id) ON DELETE RESTRICT,
 CHECK((student_code_id IS NOT NULL)::int+(staff_invitation_id IS NOT NULL)::int=1)
);
CREATE INDEX campus_personnel_credentials_person_idx ON campus_personnel_credentials(person_id);
