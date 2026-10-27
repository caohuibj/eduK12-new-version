import type {EducationAssessmentDirectory,EducationAssessmentResource,EducationAssessmentScope} from '../api/educationAssessmentResources'
export const assessmentScope:EducationAssessmentScope={
  product:'TEACHER',organizationId:'11111111-1111-4111-8111-111111111111',actorKey:'current-actor',
  workflowId:'22222222-2222-4222-8222-222222222222',runId:'33333333-3333-4333-8333-333333333333',expectedVersion:3,
}
export function assessmentResource(scope=assessmentScope,family:EducationAssessmentResource['family']='COGNITIVE'):EducationAssessmentResource{
  const role=scope.product==='TEACHER'?'TEACHER':'STUDENT'
  return {title:'已授权测评甲',family,key:`education-assessment:${scope.product}:${scope.organizationId}:44444444-4444-4444-8444-444444444444`,
    version:'1.0.0',product:scope.product,organizationId:scope.organizationId,releaseStatus:'PUBLISHED',availability:'AVAILABLE',educationOriginHash:'a'.repeat(64),
    requestedPolicy:{subjectRoles:[role],respondentRoles:[role],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'EXPLICIT_APPROVED_PERSONAL_V1',minimumRespondents:null},
    units:[{itemId:'55555555-5555-4555-8555-555555555555',family:family==='SITUATIONAL'?'SJT':'COGNITIVE',
      measurement:{releaseId:'66666666-6666-4666-8666-666666666666',contentHash:'b'.repeat(64),measurementHash:'c'.repeat(64)},
      references:[{releaseId:'77777777-7777-4777-8777-777777777777',contentHash:'d'.repeat(64)}],
      report:{releaseId:'88888888-8888-4888-8888-888888888888',contentHash:'e'.repeat(64)}}]}
}
export function assessmentDirectory(scope=assessmentScope,list=[assessmentResource(scope)],nextCursor:string|null=null):EducationAssessmentDirectory{
  const {actorKey:_actorKey,...binding}=scope
  return {scope:binding,list,nextCursor}
}
