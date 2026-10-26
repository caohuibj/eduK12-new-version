import {expect,it} from 'vitest'

// Keep the actual controller/runtime graph separate from the registry-mocking
// instruction fixture. No START, database or queue work is performed here.
it('returns frozen text and explicit empty from the real standalone START resume/restart envelope',async()=>{
    process.env.DATA_ENCRYPTION_KEY ||= 'aa'.repeat(32)
    const {compileResearchScale}=await import('../../modules/survey/builder.compiler')
    const {createFrozenScaleRuntimeSnapshot,persistFrozenScaleRuntimeSnapshot}=await import('../../modules/assessment-runtime/runtime-snapshot')
    const {canonicalHashObjectParts}=await import('../../modules/assessment-runtime/canonical')
    const {scaleRunnerResponse}=await import('../../modules/scale/scale-start.controller')
    const definition=compileResearchScale('Frozen wording',{schemaVersion:1,respondentType:'participant_self_report',responseOptions:[{optionKey:'low',label:'Low',score:0},{optionKey:'high',label:'High',score:2}],dimensions:[{dimensionKey:'sum',label:'Sum',direction:'descriptive'}],aggregation:'sum',items:[{itemKey:'i',prompt:'I',required:true,reverse:false,dimensionKeys:['sum']}]})
    const scale={id:'instruction-envelope-scale',code:'instruction-envelope',name:'Frozen wording',instrumentVersion:'1',instruction:'Later edited live text',definition}
    for(const value of [{text:'Original administered wording',version:'wording-v1',origin:'SCALE_FIELD' as const},null,undefined]){
      let snapshot=createFrozenScaleRuntimeSnapshot({instrumentKey:scale.code,instrumentVersion:'1',definition,instruction:value})
      if(value===undefined){
        const legacy:any=structuredClone(snapshot);delete legacy.instruction;delete legacy.snapshotHash
        legacy.snapshotHash=canonicalHashObjectParts(legacy);snapshot=legacy
      }
      const assessment={id:'instruction-envelope-attempt',scaleId:scale.id,status:'IN_PROGRESS',attemptEpoch:1,startedAt:new Date('2026-10-26T00:00:00Z'),answers:null,result:null,runtimeSnapshotEncrypted:await persistFrozenScaleRuntimeSnapshot(snapshot)}
      const response=await scaleRunnerResponse(assessment,scale)
      expect(response.scale.instruction).toBe(value===undefined?scale.instruction:value?.text??null)
      expect(response.assessment.id).toBe(assessment.id)
      expect(response.scale.definitionHash).toBe(snapshot.legacyDefinitionHash)
    }
  },30000)
