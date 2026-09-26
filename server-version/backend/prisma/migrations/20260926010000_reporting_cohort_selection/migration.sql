CREATE INDEX organization_label_assignment_asof_idx ON organization_label_assignments (organization_id, label_id, valid_from, valid_until, membership_id);
CREATE INDEX organization_student_class_asof_idx ON organization_student_class_assignments (organization_id, class_unit_id, valid_from, valid_until, membership_id);
CREATE INDEX reporting_track_resource_discovery_idx ON assessment_run_tracks (organization_id, resource_family, resource_key, run_id, id);
