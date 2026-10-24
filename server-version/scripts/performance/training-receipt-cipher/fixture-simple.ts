import { randomUUID } from 'node:crypto'

export const createReportOutboxFixture = async (db: any, units = 1, questions = 20) => {
  const {getParticipantKey}=await import(process.env.BENCH_SOURCE_ROOT!+'/src/modules/assessment-runtime/participant-key.ts')
  const {canonicalHash}=await import(process.env.BENCH_SOURCE_ROOT!+'/src/modules/assessment-runtime/canonical.ts')
  const {prepareTrainingFeedbackBinding,freezeTrainingFeedbackSnapshot}=await import(process.env.BENCH_SOURCE_ROOT!+'/src/modules/composite/training-feedback-binding.ts')
  const { scaleDefinitionFor }=await import(process.env.BENCH_SOURCE_ROOT!+'/src/__tests__/integration/mini-scale-definition.ts')
  const { hashScaleDefinition }=await import(process.env.BENCH_SOURCE_ROOT!+'/src/modules/scale/scale-definition.ts')
  const { createFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot }=await import(process.env.BENCH_SOURCE_ROOT!+'/src/modules/assessment-runtime/runtime-snapshot.ts')
  const { encryptFrozenActiveSlotSet }=await import(process.env.BENCH_SOURCE_ROOT!+'/src/modules/assessment-runtime/slot-set.ts')
  const { freezeCompositeActiveSlotSet }=await import(process.env.BENCH_SOURCE_ROOT!+'/src/modules/assessment-runtime/attempt-runtime.ts')
  const suffix = randomUUID().slice(0, 8)
  const owner = await db.user.create({ data: { username: 'report-owner-' + suffix, passwordHash: 'synthetic-unused', role: 'TEACHER' } })
  const participant = await db.user.create({ data: { username: 'report-participant-' + suffix, passwordHash: 'synthetic-unused', role: 'STUDENT' } })
  const course = await db.course.create({data:{title:'Synthetic Training baseline',courseCode:'tb-'+suffix,courseType:'TRAINING_COURSE',status:'PUBLISHED',creatorId:owner.id}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:participant.id,status:'APPROVED'}})
  const policy = {schemaVersion:1,mode:'IMMEDIATE'}
  const composite = await db.compositeAssessment.create({ data: {
    code: 'report-q-' + suffix, name: 'Synthetic report outbox fixture', productKind: 'QUESTIONNAIRE',
    questionnaireType: 'COURSE', status: 'PUBLISHED', createdBy: owner.id, publishedAt:new Date(), trainingFeedbackPolicy:policy, trainingFeedbackPolicyHash:canonicalHash(policy), 
  } })
  await db.questionnaireCourseDelivery.create({data:{compositeId:composite.id,courseId:course.id}})
  const unitsData = []
  for (let index = 0; index < units; index++) {
    const definition = scaleDefinitionFor(questions, 'report-item-' + suffix + '-' + index)
    const scale = await db.scale.create({ data: {
      code: 'report-scale-' + suffix + '-' + index, name: 'Synthetic scale', creatorId: owner.id,
      visibility: 'PUBLIC', status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0',
      definition: definition as any, definitionHash: hashScaleDefinition(definition), itemCount: questions, dimensionCount: 1,
    } })
    const runtime = createFrozenScaleRuntimeSnapshot({ instrumentKey: scale.code, instrumentVersion: scale.instrumentVersion, definition })
    const item = await db.compositeAssessmentItem.create({ data: { compositeAssessmentId: composite.id, type: 'SCALE', position: index, required: true, scaleId: scale.id } })
    unitsData.push({ scale, runtime, item, definition })
  }
  const slots = freezeCompositeActiveSlotSet({ attemptEpoch: 1, scales: unitsData.map(unit => ({
    compositeItemId: unit.item.id, code: unit.scale.code, instrumentVersion: unit.scale.instrumentVersion,
    sourceDefinitionHash: unit.runtime.sourceDefinitionHash, compiledRuntimeHash: unit.runtime.compiledRuntime.compiledRuntimeHash,
  })), cognitive: [], formSections: [] })
  const parentId=randomUUID()
  const binding = prepareTrainingFeedbackBinding({composite:{...composite,questionnaireCourses:[{courseId:course.id}]},courseId:course.id,accessTokenId:null})!
  const snapshot=freezeTrainingFeedbackSnapshot({...binding,attemptId:parentId,attemptEpoch:1})
  const parent = await db.compositeAssessmentAttempt.create({ data: {
    id:parentId,trainingFeedbackSnapshot:snapshot,trainingFeedbackSnapshotHash:canonicalHash(snapshot),compositeAssessmentId: composite.id, userId: participant.id, participantKey: getParticipantKey(participant.id),
    deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, deliveryCourseId:course.id,
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash,
  } })
  const inputs = []
  for (const unit of unitsData) {
    const child = await db.assessment.create({ data: {
      scaleId: unit.scale.id, userId: participant.id, compositeAttemptId: parent.id, compositeItemId: unit.item.id,
      deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
      runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(unit.runtime), compiledRuntimeHash: unit.runtime.compiledRuntime.compiledRuntimeHash,
    } })
    inputs.push({ assessmentId: child.id, submissionId: 'report-submit-' + randomUUID(), attemptEpoch: 1,
      definitionHash: hashScaleDefinition(unit.definition), contextSnapshotHash: null,
      compositeAttemptId: parent.id, userId: participant.id,
      answers: unit.definition.items.map(item => ({ itemCode: item.itemCode, responseValue: 'yes' })),
    })
  }
  return { parent, owner, participant, composite, inputs, scaleIds: unitsData.map(unit => unit.scale.id) }
}
