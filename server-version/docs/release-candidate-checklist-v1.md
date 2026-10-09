> Historical full-platform checklist. For newly implemented scoped A/B application releases use `docs/release/README.md`; this remains applicable to C and its unchanged scientific/data/security/recovery contracts. Do not use it to silently weaken a selected check.

# Milestone F Release Candidate Checklist v1

**候选版本：** eduK12 + Cognitive Core v1
**状态：** APPROVED FOR MILESTONE G REVIEW
**日期：** 2026-08-20

## F Gate

- [x] Cognitive regression PASS
- [x] Repository regression PASS after approved baseline closeout
- [x] Baseline closeout report completed
- [x] Fresh migration validation PASS
- [x] Docker config/build/startup PASS
- [x] Backend/frontend build PASS
- [x] Session ownership/history security tests PASS
- [x] Cognitive data integrity checks PASS
- [x] Known limitations documented

## G Handoff

- [x] Release scope limited to eduK12 + Cognitive Core + Reaction/Memory/Stroop + Results/History
- [x] Published engine/scoring/config versions recorded
- [x] Production configuration template defaults Cognitive flags to enabled
- [x] Release notes and deployment/rollback checklist prepared
- [ ] `dev` approved and merged through repository review
- [ ] `main` updated through repository review
- [ ] `v1.0.0` tag created and pushed

The three unchecked items are repository release operations, not unverified product behavior; they require the authorized GitHub review/release step.

## Fix-2 数据库与本地门禁

- [ ] 入口/负载均衡已 drain，所有旧 backend、worker/queue consumer 和 frontend 已停止（必须早于 migration）
- [ ] 生产备份和恢复演练完成并留存证据
- [ ] guarded migration 完成，四类公开令牌回填均为 `remaining=0`
- [ ] 使用 `release-preflight` service（`uploads_data:/app/uploads:ro`）执行 `db:release:preflight`，八个 public-token 约束均已验证，全部危险计数为 0
- [ ] 新版本启动后，对每个已启用的 questionnaire/check-in/composite/cognitive public workflow 各完成一次 smoke，再恢复入口流量
- [ ] 本地发布门禁使用一次性 PostgreSQL/Redis 并确认资源已清理
- [ ] Actions 额度恢复后，对 exact release SHA 补跑正式 CI

本地门禁的执行方式和证据字段见 [`release-verify-local.md`](./release-verify-local.md)。
