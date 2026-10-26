import assert from 'node:assert/strict'
/** Read-only, encoding-aware verification. Never logs decrypted values. */
export async function verifyDot356StoredFinal(db:any, attemptId:string, expectedSubmissionId?:string) {
 const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})
 assert.equal(parent.status,'COMPLETED')
 const children=await db.assessment.findMany({where:{compositeAttemptId:attemptId,attemptEpoch:parent.attemptEpoch}})
 assert.equal(children.length,1)
 const child=children[0];assert.equal(child.status,'COMPLETED');assert.equal(child.runtimeGeneration,'UNIFIED_V1')
 assert.ok(child.submissionId);if(expectedSubmissionId)assert.equal(child.submissionId,expectedSubmissionId)
 assert.match(child.submissionPayloadHash,/^[a-f0-9]{64}$/)
 const snapshots=await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attemptId,attemptEpoch:parent.attemptEpoch,sourceAttemptId:child.id}})
 assert.equal(snapshots.length,1);const snapshot=snapshots[0]
 assert.equal(snapshot.terminalState,'COMPLETED');assert.equal(snapshot.sourceSubmissionId,child.submissionId)
 assert.equal(snapshot.compiledRuntimeHash,child.compiledRuntimeHash)
 const storage=await import('../../modules/assessment-runtime/compact-assessment-storage')
 const canonical=await storage.loadStoredCanonicalUnitResults([snapshot.canonicalResultEncrypted],db)
 assert.equal(canonical.length,1);assert.ok(canonical[0].core.metrics.length>0)
 assert.deepEqual(canonical[0].persistenceProvenance,{sourceType:'ASSESSMENT',sourceAttemptId:child.id,sourceSubmissionId:child.submissionId})
 assert.equal(canonical[0].core.sourceDefinitionHash,snapshot.sourceDefinitionHash)
 const workflow=await import('../../modules/scale/scale-workflow.service')
 const raw=await workflow.loadScaleAnswers(child.answers,child,db),result=await workflow.loadScaleResult(child.result,child,{full:true},db)
 assert.equal(raw.decryptError,false);assert.equal(result.decryptError,false);assert.ok(result.result)
 const runtime=await (await import('../../modules/scale/scale-admission.service')).loadScaleAdmissionRuntime(child,db)
 assert.equal(runtime.instrumentKey,'academic_self_concept_biology_zh_cn');assert.equal(runtime.instrumentVersion,'1.0.0')
 const {hashScaleDefinition}=await import('../../modules/scale/scale-definition')
 const {canonicalHash}=await import('../../modules/assessment-runtime/canonical')
 // Both identities derive from the same verified frozen definition, not today's source.
 assert.equal(runtime.legacyDefinitionHash,hashScaleDefinition(runtime.definition))
 assert.equal(runtime.sourceDefinitionHash,canonicalHash(runtime.definition))
 assert.equal(snapshot.sourceDefinitionHash,runtime.sourceDefinitionHash)
 assert.equal(snapshot.compiledRuntimeHash,runtime.compiledRuntime.compiledRuntimeHash)
 assert.deepEqual(raw.answers.map(a=>({itemCode:a.itemCode,responseValue:a.responseValue})),runtime.definition.items.map(i=>({itemCode:i.itemCode,responseValue:'3'})))
 assert.ok(result.result.scores.length>0);assert.equal(result.result.method.definitionHash,runtime.legacyDefinitionHash)
 const factModule=await import('../../modules/assessment-runtime/scale-fact-records')
 const facts=await factModule.loadScaleFactRecords([{id:child.id,attemptEpoch:child.attemptEpoch}],db)
 const compact=factModule.isScaleFactsReference(child.result)
 assert.equal(facts.length,compact?1:0)
 if(compact){assert.equal(facts[0].submissionId,child.submissionId);assert.equal(facts[0].canonicalResultHash,canonical[0].resultHash)}
 const receipt=(await import('../../modules/composite/training-content-final')).decodeTrainingFinalReceipt(parent)!
 assert.ok(receipt);assert.equal(receipt.interpretation.units.length,1);assert.equal(receipt.interpretation.units[0].report.status,'READY');assert.ok(receipt.interpretation.units[0].references.length>0)
 return {parent,child,snapshots,canonical,safe:{attemptId,childId:child.id,submissionId:child.submissionId,parentStatus:parent.status,storageProtocol:compact?'COMPACT_FACTS':'INLINE_ENCRYPTED',finalFactCount:facts.length,childCount:children.length,snapshotCount:snapshots.length,answerCount:raw.answers.length,metricCount:canonical[0].core.metrics.length,canonicalResultHash:canonical[0].resultHash,measurementDefinitionHash:runtime.legacyDefinitionHash,sourceDefinitionHash:runtime.sourceDefinitionHash,compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash,trainingReportStatus:'READY'}}
}
