# Exact multi-grant navigation integration

Base2bfdedd3bd5299fe3272347d4fba8b54f38d4dd5; sourceb045751a29c080e6e52f67252fed7c875f007f7c. Root read full source DTO delta and pinned recovery behavior. The actual source/C/assets and each P/R asset dependency now return precise per-resource grants. Broad grants do not inject unrelated IDs; recovery returns original selected grants instead of replacing them. Actual prepare/register checks remain authoritative. No authority cache or permission expansion.

Root narrowed picker error conversion from arbitrary statusCode-shaped errors to typed known source errors. Unknown HTTP-shaped/SQL failures and NOWAIT contention propagate; invalid known source definitions can appear explicitly unavailable. One new direct test passed, exit0; no PG rerun. Source worker four new real PG cases retain their exact inputs (multiple grants, extra grant refusal, pinned recovery and P/R asset selection/registration). Not a full browser or current formal CI claim.

Frontend worker is consuming these exact DTOs; until its panel is integrated, no end-user registration UI completion claim. Candidate source list remains bounded to50, content choices50; larger-library paging is not claimed by this change. No CI/merge/deployment.
