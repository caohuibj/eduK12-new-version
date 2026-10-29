import {useEffect,useRef,useState} from 'react'
import {standardConfigurationGrantsApi as api,validStandardConfigurationPending,sameStandardConfigurationOperation,sameStandardConfigurationLineage,
 type StandardConfigurationPending,type StandardConfigurationChoice,type StandardConfigurationUse,type StandardConfigurationIssueResult,type StandardConfigurationReplacement} from '../api/standardConfigurationGrants'
import type {ApiClientError} from '../api/client'
const storageKey=(actorId:string)=>'training-exact-standard-issue:'+actorId
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
/** One unresolved issuance per live manager, independent from an open dialog.
 * Stored values contain no credentials, report body or editable C/P/R/profile. */
export function useTrainingStandardConfigurationIssue(actorId?:string){
 const [pending,setPending]=useState<StandardConfigurationPending|null>(null),[ready,setReady]=useState<string|null>(null),[blocked,setBlocked]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[absent,setAbsent]=useState(false)
 const current=useRef(actorId),inFlight=useRef(false);current.current=actorId
 useEffect(()=>{
  setPending(null);setReady(null);setBlocked(false);setError('');setBusy(false);setAbsent(false)
  if(!actorId)return
  try{
   const text=sessionStorage.getItem(storageKey(actorId)),value=text?JSON.parse(text):null
   if(value&&!validStandardConfigurationPending(value))throw Error('原固定配置请求不完整，请先核对审计，暂不能新建授权。')
   setPending(value);setReady(actorId)
  }catch(cause){setBlocked(true);setError(cause instanceof Error?cause.message:'原请求记录暂不可读。')}
  return()=>{if(current.current===actorId)current.current=undefined}
 },[actorId])
 useEffect(()=>{
  if(!pending)return
  const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)
 },[pending])
 function complete(owner:string){
  try{sessionStorage.removeItem(storageKey(owner));setPending(null);setAbsent(false);setError('')}
  catch{setError('原结果已确认，但浏览器未清除旧请求；请继续核对后再签发新配置。')}
 }
 async function send(value:StandardConfigurationPending,retry=false){
  if(!actorId||ready!==actorId||blocked||inFlight.current)throw Error('请先确认当前管理身份及原请求。')
  const owner=actorId
  try{sessionStorage.setItem(storageKey(owner),JSON.stringify(value))}catch{throw Error('浏览器无法保留原请求，本次尚未发送。')}
  setPending(value);setAbsent(false);setError('');setBusy(true);inFlight.current=true
  try{
   const response=await api.issue({id:value.combinationId,combinationHash:value.combinationHash},{requestId:value.requestId,userId:value.userId,configurationName:value.configurationName,
    ...(value.expectedUseVersion===undefined?{}:{expectedUseVersion:value.expectedUseVersion,expectedUseId:value.expectedUseId}),...(value.replaces?{replaces:value.replaces}:{})})
   if(current.current!==owner)return null
   const ack=response.data
   if(response.code!==0||!ack||!uuid.test(ack.id)||ack.userId!==value.userId||ack.combination?.releaseId!==value.combinationId||ack.combination?.combinationHash!==value.combinationHash
    ||!Number.isInteger(ack.version)||ack.version<1||!Number.isInteger(ack.currentVersion)||ack.currentVersion<ack.version||typeof ack.revoked!=='boolean'
    ||value.expectedUseId!==undefined&&(ack.id!==value.expectedUseId||ack.version!==value.expectedUseVersion!+1)
    ||!sameStandardConfigurationLineage(value.replaces,ack.supersedes))throw Error('授权回执身份不完整，请核对原请求。')
   complete(owner);return ack
  }catch(cause){
   if(current.current===owner){
    const status=(cause as ApiClientError)?.status,known=!retry&&typeof status==='number'&&status>=400&&status<500&&![408,425,429].includes(status)
    if(known)complete(owner);else setError('结果尚未确认，请先核对原请求编号，不要编制新编号。')
   }
   throw cause
  }finally{inFlight.current=false;if(current.current===owner)setBusy(false)}
 }
 async function issue(choice:StandardConfigurationChoice,userId:string,configurationName:string,grant:StandardConfigurationUse|null,replaces?:StandardConfigurationReplacement){
  if(pending||blocked||grant&&!grant.revokedAt)throw Error('请先处理原请求或明确撤销当前授权。')
  const value={requestId:crypto.randomUUID(),combinationId:choice.id,combinationHash:choice.combinationHash,userId,configurationName:configurationName.trim(),title:choice.title,
   ...(grant?{expectedUseVersion:grant.version,expectedUseId:grant.id}:{}),...(replaces?{replaces:{...replaces,reason:replaces.reason.trim()}}:{})}
  if(!validStandardConfigurationPending(value))throw Error('请填写业务配置名称并确认原使用权修订。')
  return send(value)
 }
 async function recover(){
  if(!pending||!actorId||ready!==actorId||inFlight.current)return null
  const owner=actorId,value=pending;setBusy(true);setError('');setAbsent(false);inFlight.current=true
  try{
   const response=await api.operation(value)
   if(current.current!==owner)return null
   if(response.code!==0||!response.data||!Object.prototype.hasOwnProperty.call(response.data,'operation'))throw Error('原请求回读格式不完整。')
   if(response.data.operation===null){setAbsent(true);return null}
   if(!sameStandardConfigurationOperation(owner,value,response.data.operation))throw Error('原请求的接收者、配置、管理依据或原修订不一致，请核对审计。')
   complete(owner);return response.data.operation!.grant
  }catch(cause){if(current.current===owner)setError(cause instanceof Error?cause.message:'原请求暂不可读');return null}
  finally{inFlight.current=false;if(current.current===owner)setBusy(false)}
 }
 return {pending,busy,error,absent,canIssue:Boolean(actorId&&ready===actorId&&!pending&&!blocked&&!busy),issue,recover,
  retry:()=>pending&&absent?send(pending,true):Promise.resolve(null)}
}
export const trainingIssueOutcome=(grant:Pick<StandardConfigurationIssueResult,'revoked'|'version'|'currentVersion'>|{revoked:boolean;version:number;currentVersion:number|null})=>
 grant.revoked||grant.currentVersion!==grant.version?'原固定配置请求已保存；该修订目前已撤销或已有后续修订。':'原固定配置请求已确认保存。'
