import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  COGNITIVE_RESPONSE_INHIBITION_V1,
  INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
  INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
  SDQ_PARENT_OBSERVER_ZH_CN_V1,
  SDQ_TEACHER_OBSERVER_ZH_CN_V1,
  TEXI_PARENT_OBSERVER_ZH_CN_V1,
  TEXI_TEACHER_OBSERVER_ZH_CN_V1,
  WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
  buildBundleContextFacts,
  buildFrozenAssessmentBundleSnapshot,
  createProductBundleAnalysisEngineRegistry,
  hashBundleContextDefinition,
  projectBundleCognitiveSource,
  projectBundleScaleSource,
  projectBundleReportFacts,
  validateAssessmentBundleDefinition,
} from "../../modules/assessment-bundle"

import { compileBundleRuntimeFromFrozenRead } from "../../modules/assessment-bundle/compile"
import { runExplicitBundleReanalysis } from "../../modules/assessment-reanalysis"
import {
  acknowledgeSafetyCase,
  applySafetyWakeup,
  buildSafetyIdempotencyKey,
  buildTestOnlyAuthoritativeTrigger,
  buildTestOnlySafetyPolicy,
  createSafetyCaseAtomic,
  scheduleSafetyWakeups,
} from "../../modules/assessment-safety"
import {
  approveInstrumentAuthorization,
  attachAuthorizationEvidence,
  createInstrumentAuthorizationDraft,
} from "../../modules/assessment-authorization"
import {
  AssessmentObserverError,
  assertTeacherAssignedConsentAcceptedForAttempt,
  parentAcceptTeacherAssignedConsent,
  parentSelfServeObserver,
  teacherAssignObserverToParent,
  teacherSelfReportObserver,
} from "../../modules/assessment-observer"
import {
  approveParentRelationship,
  createPendingParentRelationship,
} from "../../modules/assessment-identity"
import { SDQ_TEACHER_EN_T4_10_V1_DEFINITION } from "../../modules/scale/packages/sdq-teacher-en-t4-10-v1"
import {
  SDQ_TEACHER_OVERALL_ITEM,
  sdqTeacherT410Scorer,
} from "../../modules/scale/packages/sdq-teacher-impact-scorer"
import { isTexiLocalizationManifestSigned } from "../../modules/scale/localization/texi-localization-manifest"

const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)
const SEVEN = [
  WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
  SDQ_PARENT_OBSERVER_ZH_CN_V1,
  SDQ_TEACHER_OBSERVER_ZH_CN_V1,
  TEXI_PARENT_OBSERVER_ZH_CN_V1,
  TEXI_TEACHER_OBSERVER_ZH_CN_V1,
  COGNITIVE_RESPONSE_INHIBITION_V1,
  INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
] as const

const cognitiveResult = (metrics: Record<string, unknown>) => ({
  schemaVersion: 1 as const,
  completedAt: "2026-09-02T12:00:00.000Z",
  testType: "gonogo",
  configVersion: "1.0.0",
  engineVersion: "1.0.0",
  scoringVersion: "1.0.0",
  protocolSignature: HASH_A,
  profile: "standard" as const,
  metrics,
  quality: { state: "interpretable" as const, flags: {}, reasons: [] },
  references: [],
  report: {},
  assessmentContext: null,
})

const scaleResult = () => ({
  schemaVersion: 2 as const,
  instrument: { scaleId: "scale-adexi", code: "adexi_v1", name: "ADEXI", instrumentVersion: "2.0.0" },
  method: {
    scaleId: "scale-adexi", instrumentVersion: "2.0.0", scoringVersion: "2.0.0", reportVersion: "2.0.0",
    definitionHash: HASH_A, referenceVersions: [], assessmentContext: null,
  },
  quality: { status: "interpretable" as const, flags: [] as Array<"missing_items" | "insufficient_items" | "score_not_calculable"> },
  itemScores: [],
  scores: [
    { key: "working_memory", type: "dimension" as const, label: "WM", direction: "higher_is_worse" as const, canonical: true, displayPrecision: 0, value: 20, range: { min: 9, max: 45 }, expectedItems: ["ADEXI-01"], answeredItems: ["ADEXI-01"], status: "calculated" as const, prorated: false },
    { key: "inhibition", type: "dimension" as const, label: "INH", direction: "higher_is_worse" as const, canonical: true, displayPrecision: 0, value: 15, range: { min: 5, max: 25 }, expectedItems: ["ADEXI-03"], answeredItems: ["ADEXI-03"], status: "calculated" as const, prorated: false },
  ],
  references: [], interpretations: [], caveats: [], disclaimer: "fixture",
})

describe("Commit 16 Bundle release gates (contract; no Docker)", () => {
  it("validates seven DRAFT packages without unexpected skips", () => {
    expect(SEVEN).toHaveLength(7)
    for (const pkg of SEVEN) {
      const validated = validateAssessmentBundleDefinition(pkg)
      expect(validated.bundleKey).toBe(pkg.bundleKey)
      expect(validated.status).toBe("DRAFT")
    }
    expect(isTexiLocalizationManifestSigned()).toBe(false)
  })

  it("covers observer paths and standalone package freeze", () => {
    const pending = createPendingParentRelationship({ parentUserId: "parent-1", studentUserId: "student-1", inviteCodeId: "invite-1" })
    const relationship = approveParentRelationship({
      relationship: pending, actorUserId: "teacher-1", actorRole: "TEACHER",
      inviteCourseCreatorUserId: "teacher-1", consentVersion: "rel-consent-1", consentHash: HASH_A,
    })
    const catalog = {
      bundleKey: SDQ_PARENT_OBSERVER_ZH_CN_V1.bundleKey,
      bundleVersion: SDQ_PARENT_OBSERVER_ZH_CN_V1.bundleVersion,
      name: "SDQ parent", respondentType: "PARENT" as const,
      initiationModes: ["TEACHER_ASSIGNMENT", "PARENT_SELF_SERVE"] as Array<"TEACHER_ASSIGNMENT" | "PARENT_SELF_SERVE">,
      allowsParentSelfServe: true, releaseStatus: "PUBLISHED" as const,
      subjectMinAgeYears: 4, subjectMaxAgeYears: 17,
    }
    const teacherCatalog = {
      bundleKey: SDQ_TEACHER_OBSERVER_ZH_CN_V1.bundleKey,
      bundleVersion: SDQ_TEACHER_OBSERVER_ZH_CN_V1.bundleVersion,
      name: "SDQ teacher", respondentType: "TEACHER" as const,
      initiationModes: ["TEACHER_ASSIGNMENT"] as Array<"TEACHER_ASSIGNMENT">,
      allowsParentSelfServe: false, releaseStatus: "PUBLISHED" as const,
      subjectMinAgeYears: 4, subjectMaxAgeYears: 10,
    }
    expect(teacherAssignObserverToParent({
      catalogEntry: catalog, teacherUserId: "teacher-1", teacherRole: "TEACHER", courseId: "course-1",
      courseCreatorUserId: "teacher-1", subjectUserId: "student-1", subjectOnRoster: true,
      parentUserId: "parent-1", relationship, consentVersion: "attempt-v1",
    }).assignment.path).toBe("TEACHER_ASSIGN_PARENT")
    expect(parentSelfServeObserver({
      catalogEntry: catalog, parentUserId: "parent-1", subjectUserId: "student-1",
      relationship, consentVersion: "attempt-v1",
    }).path).toBe("PARENT_SELF_SERVE")
    expect(teacherSelfReportObserver({
      catalogEntry: teacherCatalog, teacherUserId: "teacher-1", teacherRole: "TEACHER", courseId: "course-1",
      courseCreatorUserId: "teacher-1", subjectUserId: "student-1", subjectOnRoster: true, consentVersion: "attempt-v1",
    }).path).toBe("TEACHER_SELF_REPORT")
    expect(buildFrozenAssessmentBundleSnapshot(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1).bundleKey).toBe(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1.bundleKey)
    expect(buildFrozenAssessmentBundleSnapshot(COGNITIVE_RESPONSE_INHIBITION_V1).engine.key).toBeTruthy()
    expect(buildFrozenAssessmentBundleSnapshot(
      INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      { contextDefinition: INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1 },
    ).contextDefinitionHash).toBe(hashBundleContextDefinition(INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1))
  })

  it("regression: missing frozen slot and same-version different-context-hash", () => {
    const contextFacts = buildBundleContextFacts({
      contextDefinitionKey: "integrated-adult-age-v1",
      contextDefinitionVersion: "1.0.0",
      contextDefinitionHash: hashBundleContextDefinition(INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1),
      frozenAt: "2026-09-02T12:00:00.000Z",
      facts: [{ contextKey: "subject_age_years", value: { state: "present", value: 22 } }],
    })
    const cognitive = projectBundleCognitiveSource({
      slotKey: "gonogo", expectedInstrumentKey: "gonogo", expectedInstrumentVersion: "1.0.0",
      result: cognitiveResult({ commissionRate: 0.1, dPrime: 2.0 }),
    })
    const scale = projectBundleScaleSource({
      slotKey: "adexi", expectedInstrumentKey: "adexi_v1", expectedInstrumentVersion: "2.0.0",
      result: scaleResult(),
    })
    const missing = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.bundleKey,
        targetBundleVersion: "1.0.0",
        frozenCognitiveSources: [], frozenScaleSources: [scale],
        frozenContextFacts: contextFacts, aggregateInputHash: null, actorUserId: "admin-1",
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.reason).toBe("MISSING_REQUIRED_SOURCE")

    const wrongHash = buildBundleContextFacts({
      contextDefinitionKey: "integrated-adult-age-v1",
      contextDefinitionVersion: "1.0.0",
      contextDefinitionHash: HASH_B,
      frozenAt: "2026-09-02T12:00:00.000Z",
      facts: [{ contextKey: "subject_age_years", value: { state: "present", value: 22 } }],
    })
    const hashMismatch = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.bundleKey,
        targetBundleVersion: "1.0.0",
        frozenCognitiveSources: [cognitive], frozenScaleSources: [scale],
        frozenContextFacts: wrongHash, aggregateInputHash: null, actorUserId: "admin-1",
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(hashMismatch.ok).toBe(false)
    if (!hashMismatch.ok) expect(hashMismatch.reason).toBe("CONTEXT_DEFINITION_MISMATCH")

    const ok = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.bundleKey,
        targetBundleVersion: "1.0.0",
        frozenCognitiveSources: [cognitive], frozenScaleSources: [scale],
        frozenContextFacts: contextFacts, aggregateInputHash: null, actorUserId: "admin-1",
        analysisInstanceId: "gate-analysis-1",
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
      registry: createProductBundleAnalysisEngineRegistry(),
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.reportFacts.identity.engine.key).toBe(INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.engine.key)
    expect(ok.history.historyId).toBeTruthy()
  })

  it("regression: safety uniqueness, reanalysis new case, duplicate Bull, ACK before fire", () => {
    const policy = buildTestOnlySafetyPolicy()
    const a = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_A, sourceRecordId: "snap-1" }),
      subjectUserId: "student-1", primaryOwnerUserId: "teacher-1", backupOwnerUserIds: [], actorUserId: "system",
    })
    const b = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_A, sourceRecordId: "snap-1" }),
      subjectUserId: "student-2", primaryOwnerUserId: "teacher-1", backupOwnerUserIds: [], actorUserId: "system",
    })
    expect(a.safetyCase.idempotencyKey).not.toBe(b.safetyCase.idempotencyKey)
    expect(buildSafetyIdempotencyKey({
      subjectUserId: "student-1", sourceKind: "BUNDLE_REPORT_FACTS", sourceHash: HASH_A, sourceRecordId: "snap-1",
      policyKey: policy.policyKey, policyVersion: policy.policyVersion,
    })).not.toBe(buildSafetyIdempotencyKey({
      subjectUserId: "student-1", sourceKind: "BUNDLE_REPORT_FACTS", sourceHash: HASH_A, sourceRecordId: "snap-2",
      policyKey: policy.policyKey, policyVersion: policy.policyVersion,
    }))
    const re = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_A, sourceRecordId: "snap-2" }),
      subjectUserId: "student-1", primaryOwnerUserId: "teacher-1", backupOwnerUserIds: [], actorUserId: "system",
      priorCaseId: a.safetyCase.caseId,
    })
    expect(re.created).toBe(true)
    expect(re.safetyCase.caseId).not.toBe(a.safetyCase.caseId)
    const { payloads } = scheduleSafetyWakeups({ safetyCase: a.safetyCase, policy })
    expect(Object.keys(payloads[0]!).sort().join(",")).toBe("caseId,kind,wakeupJobId")
    const first = applySafetyWakeup({ safetyCase: a.safetyCase, payload: payloads[0]!, now: a.safetyCase.ackDueAt })
    const dup = applySafetyWakeup({
      safetyCase: first.safetyCase, payload: payloads[0]!,
      existingLedger: first.ledger, priorEscalationForJob: first.event,
      now: a.safetyCase.ackDueAt,
    })
    expect(dup.job.status).toBe("DUPLICATE_NOOP")
    const c = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_B, sourceRecordId: "snap-ack" }),
      subjectUserId: "student-1", primaryOwnerUserId: "teacher-1", backupOwnerUserIds: [], actorUserId: "system",
    })
    const scheduled = scheduleSafetyWakeups({ safetyCase: c.safetyCase, policy })
    const acked = acknowledgeSafetyCase({ safetyCase: c.safetyCase, actorUserId: "teacher-1" })
    expect(applySafetyWakeup({ safetyCase: acked.safetyCase, payload: scheduled.payloads[0]!, now: c.safetyCase.ackDueAt }).event).toBeNull()
  })

  it("regression: evidence replacement, pre-consent submit, SDQ overall=No", () => {
    const draft = createInstrumentAuthorizationDraft({
      instrumentKey: "who5", instrumentVersion: "1.0.0", grantor: "WHO", grantee: "eduK12",
      scope: {
        electronicAdministration: true, scoring: true, translation: true, display: true,
        territories: ["CN"], locales: ["zh-CN"], commercialNature: "NON_COMMERCIAL",
      },
      validFrom: "2026-01-01T00:00:00.000Z", validTo: "2027-01-01T00:00:00.000Z",
      basis: "WHO-5 non-commercial", createdByUserId: "admin-1",
    })
    const pending = approveInstrumentAuthorization({
      record: draft, actorUserId: "admin-1",
      selfApprovalDeclaration: "I confirm self-approval of this authorization scope.",
    }).record
    const first = attachAuthorizationEvidence({
      record: pending, evidenceAssetId: "asset-1", evidenceSha256: HASH_A, actorUserId: "admin-1",
    })
    expect(first.mintedNewVersion).toBe(false)
    const replaced = attachAuthorizationEvidence({
      record: first.record, evidenceAssetId: "asset-2", evidenceSha256: HASH_B, actorUserId: "admin-1",
    })
    expect(replaced.mintedNewVersion).toBe(true)
    expect(replaced.record.status).toBe("DRAFT")

    const relationship = approveParentRelationship({
      relationship: createPendingParentRelationship({
        parentUserId: "parent-1", studentUserId: "student-1", inviteCodeId: "invite-1",
      }),
      actorUserId: "teacher-1", actorRole: "TEACHER", inviteCourseCreatorUserId: "teacher-1",
      consentVersion: "rel-1", consentHash: HASH_A,
    })
    const assigned = teacherAssignObserverToParent({
      catalogEntry: {
        bundleKey: SDQ_PARENT_OBSERVER_ZH_CN_V1.bundleKey, bundleVersion: "1.0.0", name: "SDQ parent",
        respondentType: "PARENT", initiationModes: ["TEACHER_ASSIGNMENT", "PARENT_SELF_SERVE"],
        allowsParentSelfServe: true, releaseStatus: "PUBLISHED", subjectMinAgeYears: 4, subjectMaxAgeYears: 17,
      },
      teacherUserId: "teacher-1", teacherRole: "TEACHER", courseId: "course-1",
      courseCreatorUserId: "teacher-1", subjectUserId: "student-1", subjectOnRoster: true,
      parentUserId: "parent-1", relationship, consentVersion: "attempt-v1",
    })
    expect(() => assertTeacherAssignedConsentAcceptedForAttempt({
      consent: assigned.consentRequired, action: "FINAL_SUBMIT",
    })).toThrow(AssessmentObserverError)
    const accepted = parentAcceptTeacherAssignedConsent({
      consentRequired: assigned.consentRequired, parentUserId: "parent-1",
    })
    expect(() => assertTeacherAssignedConsentAcceptedForAttempt({
      consent: accepted, action: "FINAL_SUBMIT",
    })).not.toThrow()

    const symptomAnswers = SDQ_TEACHER_EN_T4_10_V1_DEFINITION.items
      .filter((item) => item.itemCode.startsWith("SDQ-") && !item.itemCode.startsWith("SDQ-IMPACT"))
      .map((item) => ({ itemCode: item.itemCode, responseValue: "somewhat_true" }))
    const impact = sdqTeacherT410Scorer({
      definition: SDQ_TEACHER_EN_T4_10_V1_DEFINITION,
      answers: [...symptomAnswers, { itemCode: SDQ_TEACHER_OVERALL_ITEM, responseValue: "no" }],
    }).scores.find((row) => row.key === "impact")
    expect(impact!.value).toBe(0)
    expect(impact!.answeredItems).toEqual([])
  })

  it("migration SQL and Prisma schema include safety models", () => {
    const root = join(process.cwd(), "prisma")
    const schema = readFileSync(join(root, "schema.prisma"), "utf8")
    expect(schema).toContain("model SafetyPolicyTemplate")
    expect(schema).toContain("model SafetyCase")
    expect(schema).toContain("model SafetyCaseEvent")
    expect(schema).toContain("model SafetyWakeupLedger")
    expect(schema).toContain("ackDueAt")
    expect(schema).toContain("priorCaseId")
    expect(existsSync(join(root, "migrations/20260903240000_safety_case/migration.sql"))).toBe(true)
    const sql151 = readFileSync(join(root, "migrations/20260903250000_safety_case_prep_151/migration.sql"), "utf8")
    expect(sql151).toContain("safety_wakeup_ledger")
    expect(sql151).toContain("ack_due_at")
    expect(sql151).toContain("trigger_source_record_id")
  })

  it("product registry dispatch for integrated package is deterministic", () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(
      INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      { contextDefinition: INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1 },
    )
    const compiled = compileBundleRuntimeFromFrozenRead({
      family: "ASSESSMENT_BUNDLE", snapshotVersion: 3, snapshot,
    })
    const contextFacts = buildBundleContextFacts({
      contextDefinitionKey: "integrated-adult-age-v1",
      contextDefinitionVersion: "1.0.0",
      contextDefinitionHash: hashBundleContextDefinition(INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1),
      frozenAt: "2026-09-02T12:00:00.000Z",
      facts: [{ contextKey: "subject_age_years", value: { state: "present", value: 30 } }],
    })
    const cognitive = projectBundleCognitiveSource({
      slotKey: "gonogo", expectedInstrumentKey: "gonogo", expectedInstrumentVersion: "1.0.0",
      result: cognitiveResult({ commissionRate: 0.2, dPrime: 1.5 }),
    })
    const scale = projectBundleScaleSource({
      slotKey: "adexi", expectedInstrumentKey: "adexi_v1", expectedInstrumentVersion: "2.0.0",
      result: scaleResult(),
    })
    const registry = createProductBundleAnalysisEngineRegistry()
    const engineInput = {
      snapshot, compiledRuntime: compiled, evidence: [] as never[], contextFacts,
      aggregateInputHash: HASH_A, cognitiveSources: [cognitive], scaleSources: [scale],
    }
    const a = projectBundleReportFacts({ registry, engineInput })
    const b = projectBundleReportFacts({ registry, engineInput })
    expect(a.identity.snapshotHash).toBe(b.identity.snapshotHash)
    expect(a.enginePayload.kind).toBe(b.enginePayload.kind)
  })
})
