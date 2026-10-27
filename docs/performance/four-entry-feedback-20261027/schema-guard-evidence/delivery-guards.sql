CREATE TABLE users(id text PRIMARY KEY);
CREATE TABLE organizations(id text PRIMARY KEY);
CREATE TABLE composite_assessments(id text PRIMARY KEY);
INSERT INTO users VALUES ('author'),('reviewer');
INSERT INTO organizations VALUES ('org');
INSERT INTO composite_assessments VALUES ('source'),('runtime');
