ALTER TABLE "survey_invitations"
  DROP CONSTRAINT "survey_invitations_kind_check",
  DROP CONSTRAINT "survey_invitation_kind_target",
  ADD CONSTRAINT "survey_invitations_kind_check"
    CHECK ("kind" IN ('INVITE','PASSWORD_RESET','MFA_REBIND')),
  ADD CONSTRAINT "survey_invitation_kind_target"
    CHECK (("kind"='INVITE' AND "target_user_id" IS NULL) OR
           ("kind" IN ('PASSWORD_RESET','MFA_REBIND') AND "target_user_id" IS NOT NULL));
