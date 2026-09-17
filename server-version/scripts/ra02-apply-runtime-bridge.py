from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(rel: str, old: str, new: str) -> None:
    path = ROOT / rel
    text = path.read_text()
    if old not in text:
        raise SystemExit(f'missing pattern in {rel}: {old[:120]!r}')
    path.write_text(text.replace(old, new, 1))


# Composite service: transaction-scoped loader and relational identity freeze.
replace(
    'backend/src/modules/composite/composite.service.ts',
    "const loadComposite = async (id: string, includeItems = false) => {\n  const composite = await prisma.compositeAssessment.findUnique({",
    "const loadComposite = async (id: string, includeItems = false, db: Db = prisma) => {\n  const composite = await db.compositeAssessment.findUnique({",
)

replace(
    'backend/src/modules/composite/composite.service.ts',
    "const createAttempt = async (\n  db: Db,\n  composite: any,\n  userId: string | null,\n  accessTokenId: string | null,\n  credential?: ReturnType<typeof createRecoveryCredential>,\n  attemptNo = 1,\n  attemptEpoch = 1,\n) => {",
    "export interface RelationalCompositeAttemptIdentityV1 {\n  subjectUserId: string\n  respondentUserId: string\n  respondentType: 'SELF' | 'PARENT' | 'TEACHER' | null\n  episodeId: string\n  assignmentRef: string\n  consentId: string | null\n}\n\nconst createAttempt = async (\n  db: Db,\n  composite: any,\n  userId: string | null,\n  accessTokenId: string | null,\n  credential?: ReturnType<typeof createRecoveryCredential>,\n  attemptNo = 1,\n  attemptEpoch = 1,\n  relationalIdentity?: RelationalCompositeAttemptIdentityV1,\n) => {",
)

replace(
    'backend/src/modules/composite/composite.service.ts',
    "      attemptEpoch,\n      completedItems,\n      progress,",
    "      attemptEpoch,\n      ...(relationalIdentity ? {\n        subjectUserId: relationalIdentity.subjectUserId,\n        respondentUserId: relationalIdentity.respondentUserId,\n        respondentType: relationalIdentity.respondentType,\n        episodeId: relationalIdentity.episodeId,\n        assignmentRef: relationalIdentity.assignmentRef,\n        consentId: relationalIdentity.consentId,\n      } : {}),\n      completedItems,\n      progress,",
)

replace(
    'backend/src/modules/composite/composite.service.ts',
    "  return attempt\n}\n\nexport const startUserAttempt = async (userId: string, compositeId: string) => {",
    "  return attempt\n}\n\nexport const startRelationalCompositeAttemptInTransaction = async (\n  db: Db,\n  input: {\n    compositeAssessmentId: string\n    respondentUserId: string\n    attemptIdentity: RelationalCompositeAttemptIdentityV1\n  },\n) => {\n  if (input.attemptIdentity.respondentUserId !== input.respondentUserId) {\n    throw compositeForbidden('关系测评 respondent identity 不匹配')\n  }\n  await db.$queryRaw`SELECT \"id\" FROM \"composite_assessments\" WHERE \"id\" = ${input.compositeAssessmentId} FOR UPDATE`\n  const composite = await loadComposite(input.compositeAssessmentId, true, db)\n  assertSupportedComposite(composite)\n  if (composite.status !== 'PUBLISHED') throw compositeBadRequest('关系测评运行目标尚未发布')\n  if (composite.deliveryMode === 'LEGACY') throw compositeBadRequest('关系测评必须使用 Unified FINAL_ONLY 运行时')\n  if (composite.course?.isLibrary) throw compositeBadRequest('库课程综合测评不能作为关系测评运行目标')\n\n  const existing = await db.compositeAssessmentAttempt.findFirst({\n    where: { assignmentRef: input.attemptIdentity.assignmentRef },\n    orderBy: { startedAt: 'desc' },\n  })\n  if (existing) {\n    if (existing.userId !== input.respondentUserId || existing.compositeAssessmentId !== input.compositeAssessmentId) {\n      throw compositeConflict('关系测评 assignmentRef 已绑定到其他运行记录')\n    }\n    return existing\n  }\n\n  const participantKey = `user:${input.respondentUserId}`\n  const latest = await db.compositeAssessmentAttempt.findFirst({\n    where: { compositeAssessmentId: input.compositeAssessmentId, participantKey },\n    orderBy: { attemptNo: 'desc' },\n    select: { attemptNo: true },\n  })\n  return createAttempt(\n    db,\n    composite,\n    input.respondentUserId,\n    null,\n    undefined,\n    (latest?.attemptNo ?? 0) + 1,\n    1,\n    input.attemptIdentity,\n  )\n}\n\nexport const startUserAttempt = async (userId: string, compositeId: string) => {",
)

# Existing Composite runner access: respondent-owned read/final-submit paths accept relational respondent roles.
replace(
    'backend/src/modules/composite/composite.routes.ts',
    "const router = Router()\n",
    "const router = Router()\nconst respondentAttemptAccess = requireRole(UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER)\n",
)
for route in [
    "router.get('/attempts/:attemptId', authenticate, requireRole(UserRole.STUDENT), compositeController.getAttempt)",
    "router.get('/attempts/:attemptId/form-sections/:sectionId/assets/:assetId/content', authenticate, requireRole(UserRole.STUDENT), compositeImageController.authenticatedFormImage)",
    "router.get('/attempts/:attemptId/items/:itemId/scale/assets/:assetId/content', authenticate, requireRole(UserRole.STUDENT), compositeImageController.authenticatedScaleImage)",
    "router.post('/attempts/:attemptId/form-sections/:sectionId/items/:itemId/options/:optionIndex/video-capability', authenticate, requireRole(UserRole.STUDENT), compositeVideoController.authenticatedFormVideo)",
    "router.post('/attempts/:attemptId/items/:itemId/scale/items/:itemCode/video-capability', authenticate, requireRole(UserRole.STUDENT), compositeVideoController.authenticatedScaleVideo)",
    "router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId', authenticate, requireRole(UserRole.STUDENT), compositeController.getEmbeddedSituational)",
    "router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/assets/:assetId/content', authenticate, requireRole(UserRole.STUDENT), compositeController.embeddedSituationalAsset)",
    "router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/scenes/:sceneKey/video-sources', authenticate, requireRole(UserRole.STUDENT), situationalVideoController.embeddedAuthenticated)",
    "router.post('/attempts/:attemptId/form-sections/:sectionId/submit', authenticate, requireRole(UserRole.STUDENT), compositeController.submitFinalFormSection)",
    "router.post('/attempts/:attemptId/items/:itemId/scale/submit', authenticate, requireRole(UserRole.STUDENT), compositeController.submitFinalScale)",
    "router.post('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/submit', authenticate, requireRole(UserRole.STUDENT), compositeController.submitEmbeddedSituational)",
]:
    replace('backend/src/modules/composite/composite.routes.ts', route, route.replace('requireRole(UserRole.STUDENT)', 'respondentAttemptAccess'))

# Embedded Cognitive FINAL submit is also respondent-owned; session creation/restart stay Student-only.
replace(
    'backend/src/modules/cognitive/cognitive.routes.ts',
    "const router = Router()\n",
    "const router = Router()\nconst respondentAttemptAccess = requireRole(UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER)\n",
)
replace(
    'backend/src/modules/cognitive/cognitive.routes.ts',
    "router.post('/sessions/:id/submit', authenticate, requireRole(UserRole.STUDENT), cognitiveController.submitSessionFinal)",
    "router.post('/sessions/:id/submit', authenticate, respondentAttemptAccess, cognitiveController.submitSessionFinal)",
)

# Product routes are authenticated and server-controlled.
replace(
    'backend/src/index.ts',
    "import assetRoutes, { publicAssetRouter } from './routes/assets'\n",
    "import assetRoutes, { publicAssetRouter } from './routes/assets'\nimport relationalProductRoutes from './modules/assessment-relational/product.routes'\n",
)
replace(
    'backend/src/index.ts',
    "app.use('/api/composite-assessments', compositeRoutes)\n",
    "app.use('/api/composite-assessments', compositeRoutes)\napp.use('/api/relational-assessments', relationalProductRoutes)\n",
)

# Aggregate completion closes the relational assignment in the same transaction.
replace(
    'backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts',
    "  completedItems: true,\n} as const",
    "  completedItems: true,\n  assignmentRef: true,\n} as const",
)
replace(
    'backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts',
    "  completedItems?: number | null\n  completedScales?: number | null",
    "  completedItems?: number | null\n  assignmentRef?: string | null\n  completedScales?: number | null",
)
replace(
    'backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts',
    "      if (updated.count !== 1) throw new AggregateCasLost()\n\n      if (input.packageAnalysis && input.payloadEncrypted) {",
    "      if (updated.count !== 1) throw new AggregateCasLost()\n\n      if (input.parent.assignmentRef) {\n        const relationalUpdated = await tx.relationalAssessmentAssignment.updateMany({\n          where: { id: input.parent.assignmentRef, status: 'STARTED' },\n          data: { status: 'COMPLETED', completedAt, updatedAt: completedAt },\n        })\n        if (relationalUpdated.count !== 1) {\n          throw new InstrumentFinalSubmitError(\n            'RELATIONAL_ASSIGNMENT_CONFLICT',\n            '关系测评 assignment 状态与 Composite FINAL 不一致',\n            409,\n          )\n        }\n      }\n\n      if (input.packageAnalysis && input.payloadEncrypted) {",
)
