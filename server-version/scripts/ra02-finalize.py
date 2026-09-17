from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def patch(rel: str, old: str, new: str) -> None:
    path = ROOT / rel
    text = path.read_text()
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"pattern not found in {rel}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


# Backend: all Student→Teacher respondents for the same course/resource/privacy
# contract share one deterministic cohort episode. Repeated issuance is idempotent.
patch(
    "server-version/backend/src/modules/assessment-relational/product.service.ts",
    "import { prisma } from '../../config/database'\n",
    "import { prisma } from '../../config/database'\nimport { canonicalHash } from '../assessment-runtime/canonical'\n",
)
patch(
    "server-version/backend/src/modules/assessment-relational/product.service.ts",
    """const createEpisode = async (tx: any, input: {\n  subjectUserId: string\n  initiatedByUserId: string\n  initiationMode: 'TEACHER_CAMPAIGN' | 'PARENT_SELF_SERVE' | 'STUDENT_SELF'\n  courseId: string | null\n}) => tx.assessmentEpisode.create({\n  data: input,\n  select: { id: true },\n})\n""",
    """const createEpisode = async (tx: any, input: {\n  subjectUserId: string\n  initiatedByUserId: string\n  initiationMode: 'TEACHER_CAMPAIGN' | 'PARENT_SELF_SERVE' | 'STUDENT_SELF'\n  courseId: string | null\n}) => tx.assessmentEpisode.create({\n  data: input,\n  select: { id: true },\n})\n\nconst createCohortEpisode = async (tx: any, input: {\n  subjectUserId: string\n  courseId: string\n  resourceKind: RelationalResourceKindV1\n  resourceKey: string\n  resourceVersion: string\n  applicabilityHash: string\n}) => {\n  const cohortHash = canonicalHash({ schema: 'RelationalCohortEpisodeV1', ...input })\n  const id = `rel-cohort-${cohortHash}`\n  return tx.assessmentEpisode.upsert({\n    where: { id },\n    create: {\n      id,\n      subjectUserId: input.subjectUserId,\n      initiatedByUserId: null,\n      initiationMode: 'STUDENT_SELF',\n      courseId: input.courseId,\n      campaignKey: `relational-cohort-v1:${cohortHash}`,\n      label: 'Student relational-experience cohort',\n    },\n    update: {},\n    select: { id: true },\n  })\n}\n""",
)
patch(
    "server-version/backend/src/modules/assessment-relational/product.service.ts",
    """      const episode = await createEpisode(tx, {\n        subjectUserId: course.creatorId,\n        initiatedByUserId: input.studentUserId,\n        initiationMode: 'STUDENT_SELF',\n        courseId: input.courseId,\n      })\n      const record = buildRelationalAssignment({\n        applicability: entry.applicability,\n        relationshipSnapshot: snapshot,\n        perspective: 'RELATIONAL_EXPERIENCE',\n        episodeId: episode.id,\n        createdByUserId: input.studentUserId,\n        consentId: null,\n      })\n      await createSqlRelationalAssignmentRepository(tx as any).create(record)\n      return record\n""",
    """      const applicabilityHash = registry.applicabilityHash(entry)\n      const episode = await createCohortEpisode(tx, {\n        subjectUserId: course.creatorId,\n        courseId: input.courseId,\n        resourceKind: entry.applicability.resourceKind,\n        resourceKey: entry.applicability.resourceKey,\n        resourceVersion: entry.applicability.resourceVersion,\n        applicabilityHash,\n      })\n      const repository = createSqlRelationalAssignmentRepository(tx as any)\n      const existingRow = await tx.relationalAssessmentAssignment.findFirst({\n        where: {\n          episodeId: episode.id,\n          respondentUserId: input.studentUserId,\n          resourceKind: entry.applicability.resourceKind,\n          resourceKey: entry.applicability.resourceKey,\n          resourceVersion: entry.applicability.resourceVersion,\n        },\n        select: { id: true },\n      })\n      if (existingRow) {\n        const existing = await repository.findById(existingRow.id)\n          ?? relationalFail('RELATIONAL_RUNTIME_BINDING', 'existing cohort assignment could not be reloaded')\n        return existing\n      }\n      const record = buildRelationalAssignment({\n        applicability: entry.applicability,\n        relationshipSnapshot: snapshot,\n        perspective: 'RELATIONAL_EXPERIENCE',\n        episodeId: episode.id,\n        createdByUserId: input.studentUserId,\n        consentId: null,\n      })\n      await repository.create(record)\n      return record\n""",
)

# Privacy: do not reveal exact sub-threshold participation counts.
patch(
    "server-version/backend/src/modules/assessment-relational/product-report.service.ts",
    "return { ...base, state: 'EMPTY' as const, respondentCount: 0, snapshot: null }",
    "return { ...base, state: 'EMPTY' as const, respondentCount: null, snapshot: null }",
)
patch(
    "server-version/backend/src/modules/assessment-relational/product-report.service.ts",
    """        state: 'INSUFFICIENT' as const,\n        respondentCount,\n        snapshot: null,""",
    """        state: 'INSUFFICIENT' as const,\n        respondentCount: null,\n        snapshot: null,""",
)

# Generic Composite participant report must also enforce relational privacy; UI
# hiding alone is not an authority boundary.
patch(
    "server-version/backend/src/modules/composite/composite.routes.ts",
    "import { Router } from 'express'\n",
    "import { Router, type NextFunction, type Request, type Response } from 'express'\n",
)
patch(
    "server-version/backend/src/modules/composite/composite.routes.ts",
    "import { legacyWriteDisabled } from '../../middleware/instrumentFinalOnly'\n",
    "import { legacyWriteDisabled } from '../../middleware/instrumentFinalOnly'\nimport { instrumentError } from '../../utils/response'\nimport { RelationalAssessmentError } from '../assessment-relational/errors'\nimport { relationalProductReportService } from '../assessment-relational/product-report.service'\n",
)
patch(
    "server-version/backend/src/modules/composite/composite.routes.ts",
    "const respondentAttemptAccess = requireRole(UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER)\n",
    """const respondentAttemptAccess = requireRole(UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER)\nconst relationalRespondentReportGuard = async (req: Request, res: Response, next: NextFunction) => {\n  try {\n    if (!req.user) return next()\n    await relationalProductReportService.assertRespondentReportAllowed({\n      attemptId: req.params.attemptId,\n      userId: req.user.userId,\n    })\n    return next()\n  } catch (error) {\n    if (error instanceof RelationalAssessmentError) {\n      const status = error.code === 'RELATIONAL_ANALYSIS_ACCESS' ? 403 : 409\n      return instrumentError(res, error.code, error.message, status)\n    }\n    return next(error)\n  }\n}\n""",
)
patch(
    "server-version/backend/src/modules/composite/composite.routes.ts",
    "router.get('/attempts/:attemptId/report', authenticate, respondentAttemptAccess, compositeController.report)",
    "router.get('/attempts/:attemptId/report', authenticate, respondentAttemptAccess, relationalRespondentReportGuard, compositeController.report)",
)

# Frontend API understands subject-facing cohort report discovery.
patch(
    "server-version/frontend/src/api/relational.ts",
    "  | 'STUDENT_EXPERIENCE'\n",
    "  | 'STUDENT_EXPERIENCE'\n  | 'TEACHER_COHORT_REPORT'\n",
)
patch(
    "server-version/frontend/src/api/relational.ts",
    "  respondentCount: number\n  state: 'EMPTY' | 'INSUFFICIENT' | 'AWAITING_ANALYSIS' | 'READY'\n",
    "  respondentCount: number | null\n  state: 'EMPTY' | 'INSUFFICIENT' | 'AWAITING_ANALYSIS' | 'READY'\n",
)

# Composite focused route: same runtime/API, different namespace only.
patch(
    "server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx",
    "  const publicMode = window.location.pathname.startsWith('/public/composite')\n",
    "  const publicMode = window.location.pathname.startsWith('/public/composite')\n  const relationalMode = window.location.pathname.startsWith('/relational/')\n",
)
patch(
    "server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx",
    """  const goReport = (id: string) => {\n    navigate(publicMode ? `/public/composite/attempts/${id}/report` : `/student/composite/attempts/${id}/report`)\n  }\n""",
    """  const goReport = (id: string) => {\n    if (relationalMode) {\n      navigate('/relational/tasks')\n      return\n    }\n    navigate(publicMode ? `/public/composite/attempts/${id}/report` : `/student/composite/attempts/${id}/report`)\n  }\n""",
)
patch(
    "server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx",
    """  const restartLegacyAttempt = async () => {\n    if (!state) return\n""",
    """  const restartLegacyAttempt = async () => {\n    if (!state) return\n    if (relationalMode) {\n      setError('关系测评旧版记录不能从通用重启入口迁移，请返回任务列表重新发起。')\n      return\n    }\n""",
)
patch(
    "server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx",
    """    if (state?.deliveryMode === 'FINAL_ONLY') {\n      navigate(publicMode ? '/' : '/student')\n      return\n    }\n""",
    """    if (state?.deliveryMode === 'FINAL_ONLY') {\n      navigate(publicMode ? '/' : relationalMode ? '/relational/tasks' : '/student')\n      return\n    }\n""",
)
patch(
    "server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx",
    """    const result = resolveCompositeChildRouteContext({\n      publicMode,\n      parentAttemptId: state?.id || '',\n      item,\n    })\n""",
    """    const result = resolveCompositeChildRouteContext({\n      publicMode,\n      relationalMode,\n      parentAttemptId: state?.id || '',\n      item,\n    })\n""",
)
patch(
    "server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx",
    "<button onClick={() => goReport(state.id)} className=\"btn-primary\">查看个人报告</button>",
    "<button onClick={() => goReport(state.id)} className=\"btn-primary\">{relationalMode ? '返回关系测评' : '查看个人报告'}</button>",
)
patch(
    "server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx",
    "        onExit={() => navigate(publicMode ? '/' : '/student')}\n",
    "        onExit={() => navigate(publicMode ? '/' : relationalMode ? '/relational/tasks' : '/student')}\n",
)

# Cognitive child remains the same runner; only namespace/return context changes.
patch(
    "server-version/frontend/src/modules/cognitive/pages/CognitiveRunner.tsx",
    "  const isPublic = isPublicAssessmentPath(location.pathname)\n",
    "  const isPublic = isPublicAssessmentPath(location.pathname)\n  const relationalMode = location.pathname.startsWith('/relational/cognitive/')\n",
)
patch(
    "server-version/frontend/src/modules/cognitive/pages/CognitiveRunner.tsx",
    "      navigate(`${isPublic ? '/public' : '/student'}/cognitive/sessions/${next.sessionId}${suffix}`, { replace: true })\n",
    "      navigate(`${isPublic ? '/public' : relationalMode ? '/relational' : '/student'}/cognitive/sessions/${next.sessionId}${suffix}`, { replace: true })\n",
)
patch(
    "server-version/frontend/src/modules/cognitive/pages/CognitiveRunner.tsx",
    """  const parentTarget = parentReturnTo(\n    searchParams.get('returnTo'),\n    isPublic,\n    isPublic ? '/' : '/student/cognitive',\n  )\n  const hasParentReturn = parentTarget !== (isPublic ? '/' : '/student/cognitive')\n""",
    """  const cognitiveFallback = isPublic ? '/' : relationalMode ? '/relational/tasks' : '/student/cognitive'\n  const parentTarget = parentReturnTo(\n    searchParams.get('returnTo'),\n    isPublic,\n    cognitiveFallback,\n  )\n  const hasParentReturn = parentTarget !== cognitiveFallback\n""",
)
patch(
    "server-version/frontend/src/modules/cognitive/pages/CognitiveRunner.tsx",
    """        isPublic\n          ? `/public/cognitive/sessions/${sessionId}/result?public=1`\n          : `/student/cognitive/sessions/${sessionId}/result`,\n""",
    """        isPublic\n          ? `/public/cognitive/sessions/${sessionId}/result?public=1`\n          : relationalMode\n            ? '/relational/tasks'\n            : `/student/cognitive/sessions/${sessionId}/result`,\n""",
)
patch(
    "server-version/frontend/src/modules/cognitive/pages/CognitiveRunner.tsx",
    "          actions={<button onClick={() => navigate(isPublic ? '/' : '/student/cognitive')} className=\"btn-secondary\">返回列表</button>}\n",
    "          actions={<button onClick={() => navigate(cognitiveFallback)} className=\"btn-secondary\">返回列表</button>}\n",
)

# Register one role-aware relational product entry and focused aliases.
patch(
    "server-version/frontend/src/App.tsx",
    "const ParentHome = React.lazy(() => import('./pages/parent/ParentHome'))\n",
    "const ParentHome = React.lazy(() => import('./pages/parent/ParentHome'))\nconst RelationalTasksPage = React.lazy(() => import('./pages/relational/RelationalTasksPage'))\n",
)
patch(
    "server-version/frontend/src/App.tsx",
    "const StudentProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => <RouteAccess roles={['STUDENT']}>{children}</RouteAccess>\n",
    "const StudentProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => <RouteAccess roles={['STUDENT']}>{children}</RouteAccess>\nconst RelationalProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => <RouteAccess roles={['STUDENT', 'PARENT', 'TEACHER']}>{children}</RouteAccess>\n",
)
patch(
    "server-version/frontend/src/App.tsx",
    """          <Route\n            path=\"/parent\"\n            element={<ParentProtectedRoute><ParentHome /></ParentProtectedRoute>}\n          />\n\n          {/* Admin/Teacher Routes */}\n""",
    """          <Route\n            path=\"/parent\"\n            element={<ParentProtectedRoute><ParentHome /></ParentProtectedRoute>}\n          />\n\n          {/* Relational product routes reuse the same Composite/Cognitive/Situational runners. */}\n          <Route\n            path=\"/relational/tasks\"\n            element={<RelationalProtectedRoute><RelationalTasksPage /></RelationalProtectedRoute>}\n          />\n          <Route\n            path=\"/relational/attempts/:attemptId\"\n            element={<RelationalProtectedRoute><CompositeAssessmentPage /></RelationalProtectedRoute>}\n          />\n          <Route\n            path=\"/relational/attempts/:attemptId/report\"\n            element={<RelationalProtectedRoute><CompositeReportPage /></RelationalProtectedRoute>}\n          />\n          <Route\n            path=\"/relational/composite/situational/:attemptId\"\n            element={<RelationalProtectedRoute><SituationalRunner /></RelationalProtectedRoute>}\n          />\n\n          {/* Admin/Teacher Routes */}\n""",
)
patch(
    "server-version/frontend/src/App.tsx",
    """              <Route\n                path=\"/student/cognitive/sessions/:sessionId/result\"\n                element={\n                  <StudentProtectedRoute>\n                    <CognitiveResult />\n                  </StudentProtectedRoute>\n                }\n              />\n              <Route path=\"/public/cognitive/assignments/:token\" element={<PublicCognitiveAssignment />} />\n""",
    """              <Route\n                path=\"/student/cognitive/sessions/:sessionId/result\"\n                element={\n                  <StudentProtectedRoute>\n                    <CognitiveResult />\n                  </StudentProtectedRoute>\n                }\n              />\n              <Route\n                path=\"/relational/cognitive/sessions/:sessionId\"\n                element={<RelationalProtectedRoute><CognitiveRunner /></RelationalProtectedRoute>}\n              />\n              <Route path=\"/public/cognitive/assignments/:token\" element={<PublicCognitiveAssignment />} />\n""",
)

# Inventory must understand the dedicated relation guard instead of labeling it staff.
patch(
    "server-version/frontend/scripts/product-route-inventory.mjs",
    "const guards = new Set(['ProtectedRoute', 'ParentProtectedRoute', 'StudentProtectedRoute', 'ScaleLibraryRoute', 'OptionalStudentRoute', 'EntryRoute', 'PublicRoute'])",
    "const guards = new Set(['ProtectedRoute', 'ParentProtectedRoute', 'StudentProtectedRoute', 'RelationalProtectedRoute', 'ScaleLibraryRoute', 'OptionalStudentRoute', 'EntryRoute', 'PublicRoute'])",
)
patch(
    "server-version/frontend/scripts/product-route-inventory.mjs",
    "      : guard === 'StudentProtectedRoute' ? 'STUDENT'\n      : guard === 'ScaleLibraryRoute' ? 'STUDENT / TEACHER / ADMIN'",
    "      : guard === 'StudentProtectedRoute' ? 'STUDENT'\n      : guard === 'RelationalProtectedRoute' ? 'STUDENT / PARENT / TEACHER'\n      : guard === 'ScaleLibraryRoute' ? 'STUDENT / TEACHER / ADMIN'",
)
patch(
    "server-version/frontend/scripts/product-route-inventory.mjs",
    "- Parent login/home are explicitly registered with a PARENT-only route guard. ObserverSelfServe and Teacher ObserverAssign remain domain shells until RA-02 journey wiring registers their product routes.",
    "- Parent login/home are explicitly registered with a PARENT-only route guard. RA-02 relational tasks and focused child runtimes use one STUDENT / PARENT / TEACHER guard and keep role-specific authorization server-side.",
)

# Route/access regressions.
patch(
    "server-version/frontend/src/components/app-shell/__tests__/access.test.ts",
    "    expect(returnAfterLogin('/parent/observer', 'PARENT')).toBe('/parent/observer')\n",
    "    expect(returnAfterLogin('/relational/tasks', 'PARENT')).toBe('/relational/tasks')\n",
)
patch(
    "server-version/frontend/src/components/app-shell/__tests__/access.test.ts",
    """    expect(parentReturnTo('/student/composite/attempts/1', true, '/')).toBe('/')\n    expect(parentReturnTo('/users', false, '/')).toBe('/')\n""",
    """    expect(parentReturnTo('/student/composite/attempts/1', true, '/')).toBe('/')\n    expect(parentReturnTo('/relational/attempts/1?slot=a', false, '/')).toBe('/relational/attempts/1?slot=a')\n    expect(parentReturnTo('/users', false, '/')).toBe('/')\n""",
)
patch(
    "server-version/frontend/src/components/app-shell/__tests__/access.test.ts",
    "    expect(shellModeFor('/bigscreen/1')).toBe('display')\n",
    "    expect(shellModeFor('/relational/attempts/1')).toBe('focused')\n    expect(shellModeFor('/relational/cognitive/sessions/1')).toBe('focused')\n    expect(shellModeFor('/bigscreen/1')).toBe('display')\n",
)
patch(
    "server-version/frontend/src/components/app-shell/__tests__/access.test.ts",
    """    expect(items.map((item) => item.path)).toEqual(['/parent', '/parent/observer'])\n    expect(activeNavigation(items, '/parent/observer')).toBeDefined()\n""",
    """    expect(items.map((item) => item.path)).toEqual(['/parent', '/relational/tasks'])\n    expect(activeNavigation(items, '/relational/attempts/attempt-1')?.path).toBe('/relational/tasks')\n""",
)

# Child route regression for relational namespace.
patch(
    "server-version/frontend/src/modules/composite/__tests__/child-route-context.test.ts",
    """  it('keeps public Cognitive return context and existing session identity', () => {\n""",
    """  it('builds relational child targets without creating a second runtime', () => {\n    const cognitive = resolveCompositeChildRouteContext({\n      publicMode: false,\n      relationalMode: true,\n      parentAttemptId: 'rel-parent',\n      item: cognitiveItem,\n    })\n    expect(cognitive).toMatchObject({\n      ok: true,\n      context: {\n        parentReturnTo: '/relational/attempts/rel-parent',\n        target: '/relational/cognitive/sessions/cognitive-session-1?returnTo=%2Frelational%2Fattempts%2Frel-parent',\n      },\n    })\n\n    const situational = resolveCompositeChildRouteContext({\n      publicMode: false,\n      relationalMode: true,\n      parentAttemptId: 'rel-parent',\n      item: situationalItem,\n    })\n    expect(situational).toMatchObject({\n      ok: true,\n      context: {\n        parentReturnTo: '/relational/attempts/rel-parent',\n        childAttemptId: 'situational-attempt-1',\n      },\n    })\n    if (situational.ok) expect(situational.context.target).toContain('/relational/composite/situational/situational-attempt-1?')\n  })\n\n  it('keeps public Cognitive return context and existing session identity', () => {\n""",
)

print('RA-02 final patch applied')
