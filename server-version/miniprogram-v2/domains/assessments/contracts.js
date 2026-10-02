const { ApiError } = require('../../core/errors/index')
const renderers=require('./renderers')
function id(v){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))throw new ApiError('invalidRequest','测评标识无效');return encodeURIComponent(v)}
function hash(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw new ApiError('definitionMismatch','冻结定义标识缺失');return v}
function normalize(family,raw,ownerId,resourceId){
 let root,unit,items=[],instruction='',title='',submitPath=null,reportPath=null,definitionHash,contextSnapshotHash,unitId,unitKind
 if(family==='SCALE'){root=raw.assessment;if(!root)throw new ApiError('invalidResponse','测评状态缺失');unit=root;title=raw.scale&&raw.scale.name;instruction=raw.scale&&raw.scale.instruction;unitId=root.id;unitKind='SCALE';definitionHash=root.definitionHash||raw.scale&&raw.scale.definitionHash;contextSnapshotHash=root.contextSnapshotHash;reportPath='/scales/assessments/'+id(root.id);if(root.status==='IN_PROGRESS'){items=renderers.scaleItems(raw.scale&&raw.scale.definition);submitPath=reportPath+'/submit'}}
 else if(family==='QUESTIONNAIRE'){root=raw.questionnaireAssessment;if(!root)throw new ApiError('invalidResponse','问卷状态缺失');title=raw.questionnaire&&raw.questionnaire.name;instruction=raw.questionnaire&&raw.questionnaire.instruction;unit=raw.currentFormSection||raw.currentScale;contextSnapshotHash=raw.contextSnapshotHash||root.context&&root.context.snapshotHash;reportPath='/questionnaires/assessments/'+id(root.id)+'/report';if(unit){unitKind=raw.currentFormSection?'FORM':'SCALE';unitId=raw.currentFormSection?unit.id:unit.scaleAssessmentId;definitionHash=unit.definitionHash;items=unitKind==='FORM'?renderers.formItems(unit):renderers.scaleItems(unit.definition);submitPath='/questionnaires/assessments/'+id(root.id)+(unitKind==='FORM'?'/form-sections/':'/scales/')+id(unitId)+'/submit'}}
 else if(family==='COMPOSITE'){root=raw.attempt||raw;title=root.name;instruction=root.instruction;unit=root.currentItem;contextSnapshotHash=root.contextSnapshotHash;reportPath='/composite-assessments/attempts/'+id(root.id)+'/report';if(unit){if(unit.type==='SCALE'){unitKind='SCALE';unitId=unit.id;definitionHash=unit.definitionHash;items=renderers.scaleItems(unit.scale&&unit.scale.definition);submitPath='/composite-assessments/attempts/'+id(root.id)+'/items/'+id(unitId)+'/scale/submit'}else if(unit.type==='FORM_SECTION'){const section=unit.formSection||{...unit,items:unit.formAnswers||unit.answers};unitKind='FORM';unitId=section.id||unit.formSectionId;definitionHash=section.definitionHash;items=renderers.formItems(section);submitPath='/composite-assessments/attempts/'+id(root.id)+'/form-sections/'+id(unitId)+'/submit'}else throw new ApiError('unsupportedRenderer','当前综合测评单元使用正式网页测评')}}
 else if(family==='SITUATIONAL'){root=raw.attempt;if(!root)throw new ApiError('invalidResponse','情境测评状态缺失');unit=root;title=raw.instrument&&raw.instrument.title||'情境测评';unitId=root.id;unitKind='SITUATIONAL';definitionHash=root.definitionHash;contextSnapshotHash=null;reportPath='/situational/attempts/'+id(root.id)+'/result';if(root.status==='IN_PROGRESS'){items=renderers.situationalItems(raw.instrument);submitPath='/situational/attempts/'+id(root.id)+'/submit'}}
 else throw new ApiError('unsupportedRenderer','该测评使用正式网页测评')
 if(root.deliveryMode!=='FINAL_ONLY')throw new ApiError('unsupportedRenderer','旧测评不能在新版继续，请使用正式重启流程')
 const result={family,rootId:root.id,resourceId,rootStatus:root.status,title:title||'测评',instruction:instruction||'',unitKind,unitId,items,submitPath,reportPath,server:raw,progress:root.progress,needsComplete:family==='QUESTIONNAIRE'&&!unit&&root.status==='IN_PROGRESS'}
 if(root.status==='COMPLETED')return {...result,state:'submitted'}
 if(root.status!=='IN_PROGRESS')throw new ApiError('conflict','测评当前不能继续')
 if(!unit)return {...result,state:'ready'}
 if(!renderers.supported(items))throw new ApiError('unsupportedRenderer','当前题型或媒体需使用正式网页测评')
 result.meta={ownerId,family,attemptId:root.id,unitId:unitId,unitKind,attemptEpoch:root.attemptEpoch,definitionHash:hash(definitionHash),contextSnapshotHash:contextSnapshotHash||null}
 if(!Number.isInteger(result.meta.attemptEpoch)||result.meta.attemptEpoch<1)throw new ApiError('definitionMismatch','测评轮次缺失')
 id(unitId)
 result.initial=Object.fromEntries(items.filter(i=>i.initial!==undefined&&i.initial!==null).map(i=>[i.key,i.initial]));return {...result,state:'draft'}
}
function payload(unit,values){const normalized=renderers.validate(unit.items,values),meta=unit.meta,body={submissionId:unit.draft.commandId,attemptEpoch:meta.attemptEpoch,definitionHash:meta.definitionHash,...(meta.contextSnapshotHash?{contextSnapshotHash:meta.contextSnapshotHash}:{})}
 if(unit.unitKind==='SCALE')body.answers=unit.items.filter(i=>normalized[i.key]!==undefined).map(i=>({itemCode:i.key,responseValue:normalized[i.key]}))
 else if(unit.unitKind==='FORM')body.answers=unit.items.map(i=>({formItemId:i.key,value:normalized[i.key]===undefined?null:normalized[i.key]}))
 else if(unit.unitKind==='SITUATIONAL'){const raw=unit.server;Object.assign(body,{instrumentVersion:raw.attempt.instrumentVersion,compiledRuntimeHash:raw.attempt.compiledRuntimeHash,scoringVersion:raw.attempt.scoringVersion});body.responses=unit.items.filter(i=>normalized[i.key]!==undefined).map(i=>({sceneKey:i.sceneKey,channelKey:i.channelKey,responseValue:normalized[i.key]}))}
 return body
}
module.exports={normalize,payload,id,hash}
