# Shared education feedback timing contract

Add optional origin.feedbackPolicy using the existing trainingFeedbackPolicySchema. Absence is not defaulted or rehashed: historical origin identities remain exact. Explicit null/malformed policy is rejected. Source register will require an explicit policy and normalize UTC before freeze; production registration UI and reader integration are separate in-progress consumers, not completed by this contract. No schema/column, second hash, engine, clock service or permission cache added.

Only two added direct contract tests ran: 2PASS, 8existing filtered, exit0. Proves unchanged historical canonical origin and exact explicit policy plus rejection; no new PG/browser, type/full application qualification claimed. Source/data timestamps in tests are synthetic and never real content approval. Full candidate types are planned after actual consumers integrate.
