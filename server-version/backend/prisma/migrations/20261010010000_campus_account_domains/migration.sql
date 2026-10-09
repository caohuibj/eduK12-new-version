-- Existing accounts remain LEGACY: no inference from User.role or Course.
ALTER TABLE "users" ADD COLUMN "account_domain" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "users" ADD CONSTRAINT "users_account_domain_check"
  CHECK ("account_domain" IN ('LEGACY', 'TRAINING', 'SCHOOL'));
ALTER TABLE "users" ALTER COLUMN "account_domain" SET DEFAULT 'TRAINING';
CREATE INDEX "users_account_domain_idx" ON "users" ("account_domain", "id");

-- School logins use a separate namespace. Internal users.username stays unique.
CREATE TABLE "campus_accounts" (
  "user_id" TEXT NOT NULL,
  "login_name" TEXT NOT NULL,
  "normalized_login" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_accounts_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "campus_accounts_normalized_login_key" UNIQUE ("normalized_login"),
  CONSTRAINT "campus_accounts_login_shape_check" CHECK (
    LENGTH("login_name") BETWEEN 4 AND 32
    AND "normalized_login" = LOWER(TRIM("login_name"))
    AND "normalized_login" ~ '^[a-z0-9_.-]{4,32}$'
  ),
  CONSTRAINT "campus_accounts_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION campus_account_domain_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "users" u
    WHERE u."id" = NEW."user_id" AND u."account_domain" = 'SCHOOL'
  ) THEN
    RAISE EXCEPTION 'campus account requires SCHOOL user' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER campus_account_domain_guard_insert
  BEFORE INSERT OR UPDATE OF "user_id" ON "campus_accounts"
  FOR EACH ROW EXECUTE FUNCTION campus_account_domain_guard();

CREATE OR REPLACE FUNCTION campus_account_domain_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."account_domain" = 'SCHOOL' AND NEW."account_domain" <> 'SCHOOL' THEN
    RAISE EXCEPTION 'SCHOOL account cannot change domain' USING ERRCODE = '23514';
  END IF;
  IF NEW."account_domain" = 'SCHOOL' AND OLD."account_domain" <> 'SCHOOL' THEN
    RAISE EXCEPTION 'SCHOOL account must be created in its product domain' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER campus_account_domain_immutable
  BEFORE UPDATE OF "account_domain" ON "users"
  FOR EACH ROW EXECUTE FUNCTION campus_account_domain_immutable();
