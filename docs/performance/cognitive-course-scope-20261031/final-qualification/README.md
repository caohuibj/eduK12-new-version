# Waiting Cognitive course-scope integration

User prioritizes the two Codex report conversations. PR436 remains Draft: no Ready, CI activation, auto-merge, merge, GitHub APPROVE or deployment. This is preparation, not current-main release qualification.

Local product 4292798a0a728099a4f9108beade8a2c78566d4d and connector product b9eeafea67ceb25549554312ae09c2c6fd8c8139 share full tree 2e3d620407aa237b696b263773f5828b09fd66e2. This combines original PR436 with the waiting PR435 candidate (remote9d81ff143e971fe09e82a83e9d878aa11b226f89, itself based on mainf941e745). Full original PR ancestry is retained by merge commits; no force push.

All three course loader parameters are retained: Scale params.courseId, Cognitive getMyAssignments(courseId), Composite availableComposites(courseId). One fresh affected loader case on this exact combined source passed; triple-loader.json and triple-loader-execution.json record the actual reporter, filtered rows, argv, exit and input hashes. No full suite. Original service/controller/API changes remain byte-identical to original PR436 product. Published status, ACTIVE/APPROVED enrollment, standalone/library predicates, OFF/history/session behavior, default no-course API URI and permission semantics are unchanged.

Other files in this directory describe the earlier 7865d827 combined Scale/Cognitive input, NOT the present final source. Earlier frontend types passed; initial backend process exited -9 and is retained, then backend alone with NODE_OPTIONS=--max-old-space-size=2048 passed. Neither is relabeled as current qualification. Original business reporters and failures remain untouched under the parent evidence folder.

Final exact PR436 registration, affected component types and formal existing CI remain pending until report lines and PR435 finish. All current main/435 control records are preserved verbatim; 435 is explicitly disabled, and 436 has no active qualification registration yet. Only checks genuinely missing on final input should be run. Preserve successful artifacts rather than rerunning while main moves. No new framework, gate, threshold or broad defensive code.
