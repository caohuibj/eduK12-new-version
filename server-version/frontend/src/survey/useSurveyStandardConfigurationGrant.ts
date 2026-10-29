import {useEffect,useRef,useState} from 'react'
import type {CatalogApi,CatalogGrant,CatalogSourceRef} from './ResearchCatalog'
import {isSurveyStandardPending,sameSurveyStandardOperation,type SurveyStandardPending,type SurveyStandardOperation,type SurveyStandardReplacement} from '../api/surveyStandardConfigurations'
const key=(id:string)=>'survey-exact-standard-use:'+id

/** One unresolved operation per authenticated manager across recipient/source
 * changes. The server supplies actorId; neither issuer nor secrets are stored
 * in the pending request or accepted as authorization from this hook. */
export function useSurveyStandardConfigurationGrant(actorId:string|null,api:CatalogApi){
 const [pending,setPending]=useState<SurveyStandardPending|null>(null),[ready,setReady]=useState<string|null>(null)
 const [blocked,setBlocked]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[absent,setAbsent]=useState(false)
 const actor=useRef(actorId),inFlight=useRef(false);actor.current=actorId
 useEffect(()=>{
  setPending(null);setReady(null);setError('');setBlocked(false);setAbsent(false);setBusy(false)
  if(!actorId)return
  try{
   const text=sessionStorage.getItem(key(actorId)),value=text?JSON.parse(text):null
   if(value&&!isSurveyStandardPending(value))throw Error('原请求记录不完整，请先核对审计；不能另编新请求。')
   setPending(value);setReady(actorId)
  }catch(reason){setBlocked(true);setError(reason instanceof Error?reason.message:'无法读取原请求，请先核对审计。')}
  return()=>{if(actor.current===actorId)actor.current=null}
 },[actorId])
 useEffect(()=>{
  if(!pending)return
  const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)
 },[pending])
 function complete(owner:string){
  try{sessionStorage.removeItem(key(owner));setPending(null);setAbsent(false);setError('')}
  catch{setError('结果已确认，浏览器仍未清除原请求；请继续核对后再签发新配置。')}
 }
 async function send(value:SurveyStandardPending,password:string){
  if(!actorId||ready!==actorId||blocked||inFlight.current||!password)throw Error('请先确认管理身份、原请求及当前密码。')
  const owner=actorId
  // Persist BEFORE sending; a storage failure has no server write to retry.
  try{sessionStorage.setItem(key(owner),JSON.stringify(value))}
  catch{throw Error('浏览器无法保留原请求，本次尚未发送；请先恢复浏览器存储。')}
  setPending(value);setAbsent(false);setError('');inFlight.current=true;setBusy(true)
  try{
   const grant=await api<CatalogGrant>('/researchers/'+encodeURIComponent(value.recipientId)+'/tool-grants','POST',{
    currentPassword:password,source:value.source,exact:{requestId:value.requestId,configurationName:value.configurationName,...(value.replaces?{replaces:value.replaces}:{})}})
   if(actor.current!==owner)return null
   if(!sameSurveyStandardOperation(value,{grant,request:{requestId:value.requestId,userId:value.recipientId,configurationName:value.configurationName,source:value.source,...(value.replaces?{replaces:value.replaces}:{})}}))
    throw Error('回执与原固定配置身份不一致。')
   complete(owner);return grant
  }catch(reason){
   if(actor.current===owner)setError('未确认结果，请先核对原请求编号，不能改号重发。')
   throw reason
  }finally{inFlight.current=false;if(actor.current===owner)setBusy(false)}
 }
 async function issue(recipientId:string,source:CatalogSourceRef,title:string,configurationName:string,password:string,replaces?:SurveyStandardReplacement){
  if(pending||blocked)throw Error('请先核对原配置请求。')
  const value={requestId:crypto.randomUUID(),recipientId,source:{kind:source.kind,sourceId:source.sourceId,sourceVersion:source.sourceVersion},title,configurationName:configurationName.trim(),...(replaces?{replaces}:{})}
  if(!isSurveyStandardPending(value))throw Error('请填写业务配置名称，并选择已批准的精确标准量表组合。')
  return send(value,password)
 }
 async function recover(){
  if(!pending||!actorId||ready!==actorId||inFlight.current)return null
  const owner=actorId,value=pending;inFlight.current=true;setBusy(true);setAbsent(false);setError('')
  try{
   const read=await api<{operation:SurveyStandardOperation|null}>('/researchers/'+encodeURIComponent(value.recipientId)+'/tool-grant-requests/'+value.requestId)
   if(actor.current!==owner)return null
   if(!read||!Object.prototype.hasOwnProperty.call(read,'operation'))throw Error('原请求回读格式不完整。')
   if(read.operation===null){setAbsent(true);return null}
   if(!read.operation)throw Error('原请求回读格式不完整，不能确认请求不存在。')
   if(!sameSurveyStandardOperation(value,read.operation))throw Error('原请求已存在，但完整配置意图不一致，请核对审计。')
   complete(owner);return read.operation.grant
  }catch(reason){if(actor.current===owner)setError(reason instanceof Error?reason.message:'原请求暂不可读');return null}
  finally{inFlight.current=false;if(actor.current===owner)setBusy(false)}
 }
 return {pending,error,busy,absent,canIssue:Boolean(actorId&&ready===actorId&&!pending&&!blocked&&!busy),issue,recover,
  retry:(password:string)=>pending&&absent?send(pending,password):Promise.resolve(null)}
}
