import React from 'react'
import { createRoot } from 'react-dom/client'
import { AntTask } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/ant/AntTask'
import { AntReportCard } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/ant/AntReportCard'
import { antFixtureDisplay } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/ant/test-fixtures'
import { readAntViewport } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/ant/display'
import type { AntRawRecord } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/ant/capture'
import data from './preview-data.json'
const query=new URLSearchParams(location.search),language=query.get('lang')==='en'?'en':'zh'
const view=query.get('view')??'task',state=query.get('state')??'interpretable',contextId=query.get('context')??'ant-fixed-synthetic-context'
const frozen={...antFixtureDisplay(readAntViewport()),configHash:data.configHash,protocolSignature:data.protocolSignature}
let failOnce=query.get('fail')==='1'||query.get('lateFail')==='1'
const review={saveCalls:[] as {key:string;digest:string;record:AntRawRecord}[],completion:null as unknown}
;(window as unknown as {__ANT_REVIEW__:typeof review}).__ANT_REVIEW__=review
function db():Promise<IDBDatabase>{return new Promise((yes,no)=>{
 const open=indexedDB.open('ant-cloud-review-fixture-v1',1)
 open.onupgradeneeded=()=>{open.result.createObjectStore('claims');open.result.createObjectStore('records')}
 open.onsuccess=()=>yes(open.result);open.onerror=()=>no(open.error)
})}
async function put(store:'claims'|'records',key:string,value:unknown,onlyNew=false):Promise<void>{
 const database=await db()
 await new Promise<void>((yes,no)=>{
  const transaction=database.transaction(store,'readwrite'),target=transaction.objectStore(store)
  if(onlyNew)target.add(value,key);else target.put(value,key)
  transaction.oncomplete=()=>yes();transaction.onerror=()=>no(transaction.error);transaction.onabort=()=>no(transaction.error)
 }).finally(()=>database.close())
}
const root=createRoot(document.getElementById('root')!)
if(view==='report'){
 document.getElementById('fixture-note')!.style.display='none'
 const report=(data.reports as Record<string,typeof data.reports.interpretable>)[state]
 root.render(<AntReportCard data={report as never} contextId="ant-synthetic-report" configHash={data.configHash}
  protocolSignature={data.protocolSignature} language={language} synthetic/>)
}else root.render(<AntTask contextId={contextId} config={data.config as never} randomSeed={data.seed}
 configHash={data.configHash} protocolSignature={data.protocolSignature} display={query.get('missing')==='1'?null:{frozen,readViewport:readAntViewport}}
 language={language} allowSyntheticFixture
 claimAttemptExposure={async identity=>{await put('claims',identity.contextId,identity,true);return {...identity,durable:true,fresh:true,claimId:'cloud-idb-fixture-claim'}}}
 persistLocalDraft={async(record,seal)=>{
  review.saveCalls.push({key:record.key,digest:seal.recordDigest,record:structuredClone(record)})
  if(failOnce){failOnce=false;if(query.get('lateFail')==='1')await new Promise(resolve=>setTimeout(resolve,250));throw Error('Synthetic local write failure')}
  await put('records',contextId+'/'+record.key,{record,seal})
  return {durable:true,...seal}
 }}
 onTaskComplete={async completion=>{review.completion=completion;return null}}/>)
if(query.get('zoom')==='2')document.body.style.zoom='2'
document.documentElement.lang=language
