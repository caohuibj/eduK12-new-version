# Teacher Form saved-version continuation

Parent local prepared chain f7c104a512ce412ba8f6e8b4fc8852528bed4c31; production source c0591a4f3d3efb27ba139323c39f229ea8d84e89. This is a separate follow-up to numeric paging and does not modify frozen PR423–431 candidates.

Existing Form versions were retained but the first100 index had no continuation. The same seek pattern as numeric history now uses released_at/id and a UTC microsecond timestamp, preserving existing organization/event/form/definition/policy filters and the100-item page size. Queries read released-report pointer/label metadata, not FINALs, answers or scoring. Existing current Teacher product administrator authorization and individual version reading are unchanged. The page appends/deduplicates older pointers; pagination and directory refresh preserve the selected saved report. Failed older-page reading retains its cursor for a GET-only retry.

One React boundary case passed: start with100 versions, preserve exact .123456Z/id cursor, retain current report after failed older-page GET, retry to append101st version, then read that older saved version without any POST. It is a mocked API/component case, not a new real database/HTTP/browser journey. No submissions, release generation, cohort statistics or original test suites were replayed.

Initial CLI invocation rejected unsupported --minWorkers before test collection; raw error remains frontend-initial-cli.log. The corrected installed-CLI invocation ran the one new case once. Current backend and frontend types each passed once at source tree00b530a76e4543d2229313caee7829b803ca285b, with stable tracked input receipts. No migration or production action, no formal qualification or merge is claimed.
