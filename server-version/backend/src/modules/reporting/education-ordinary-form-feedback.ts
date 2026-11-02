import type {Prisma} from '@prisma/client'
import {validateFormDefinition} from '../assessment-core/form/definition'
import {describeFormResponse} from '../assessment-core/form/descriptive'
import {readFormSectionCollectionFacts} from '../assessment-runtime/form-facts'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {formSectionSlotKey,loadFrozenActiveSlotSet} from '../assessment-runtime/slot-set'
import {readFrozenCompositionIdentity} from '../assessment-run/educationCompositionExecution'
import {reportingFail} from './types'
type Identity=Awaited<ReturnType<typeof readFrozenCompositionIdentity>>
function fail():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}

/** Caller must establish current Teacher SELF authority. Each new Form block
 * also needs its explicitly frozen respondent ceiling; historical Forms keep
 * completion-only feedback. Only declared categorical fields are projected. */
export async function readOrdinaryFormDescriptions(tx:Prisma.TransactionClient,input:{identity:Identity;
 parentId:string;attemptEpoch:number;slots:Awaited<ReturnType<typeof loadFrozenActiveSlotSet>>;blockIds:Set<string>}){
 const blocks=input.identity.manifest.filter(b=>input.blockIds.has(b.blockId))
 const rows=await tx.educationPrivateToolVersion.findMany({where:{id:{in:blocks.map(b=>b.versionId)},kind:'FORM',entry:'TEACHER'},select:{id:true,contentHash:true,definition:true}})
 const finals=await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:input.parentId,attemptEpoch:input.attemptEpoch,slotKey:{in:blocks.flatMap(b=>b.sectionIds.map(formSectionSlotKey))}}})
 const sections=await tx.compositeFormSectionAttempt.findMany({where:{attemptId:input.parentId,attemptEpoch:input.attemptEpoch,sectionId:{in:blocks.flatMap(b=>b.sectionIds)},status:'COMPLETED'},select:{id:true,sectionId:true,submissionId:true}})
 const reports=new Map<string,NonNullable<ReturnType<typeof describeFormResponse>>>()
 for(const b of blocks){
  if(b.kind!=='FORM'||b.sourceProvider!=='PRIVATE_VERSION')fail()
  const row=rows.find(r=>r.id===b.versionId&&r.contentHash===b.contentHash)
  const checked=validateFormDefinition(row?.definition,{forPreview:true}),form=checked.definition
  if(!form||checked.issues.some(i=>i.severity==='error')||form.descriptive?.selfAudience!=='TEACHER'||form.pages.length!==b.sectionIds.length)fail()
  const answers:Record<string,unknown>={},missing:Array<{itemKey:string;reason:string}>=[]
  let offset=0
  for(const [i,page] of form.pages.entries()){
   const sectionId=b.sectionIds[i],slotKey=formSectionSlotKey(sectionId),slot=input.slots.slots.find(s=>s.slotKey===slotKey)
   const final=finals.find(f=>f.slotKey===slotKey),section=sections.find(s=>s.sectionId===sectionId)
   if(!slot||!final||!section||!section.submissionId||final.terminalState!=='COMPLETED'||final.unitType!=='FORM_SECTION'
    ||final.sourceAttemptId!==section.id||final.sourceSubmissionId!==section.submissionId||final.sourceDefinitionHash!==slot.sourceDefinitionIdentity.hash||!final.collectionFactsEncrypted)fail()
   const facts=readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(final.collectionFactsEncrypted))
   if(facts.schemaVersion!==3||facts.sectionKey!==sectionId||facts.items.length!==page.questions.length)fail()
   for(const [j,q] of page.questions.entries()){
    const f=facts.items.find(item=>item.key===b.itemIds[offset+j]);if(!f||f.label!==q.prompt)fail()
    // Text and undeclared fields never leave the original FINAL.
    if(form.descriptive.items.some(rule=>rule.itemKey===q.itemKey)){
     if(f.state==='ANSWERED')answers[q.itemKey]=f.value
     else missing.push({itemKey:q.itemKey,reason:f.state})
    }
   }
   offset+=page.questions.length
  }
  if(offset!==b.itemIds.length)fail()
  reports.set(b.blockId,describeFormResponse(form,answers,missing)!)
 }
 return reports
}
