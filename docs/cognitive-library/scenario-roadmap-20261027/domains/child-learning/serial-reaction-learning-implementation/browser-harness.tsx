import React from 'react'
import {createRoot} from 'react-dom/client'
import {SerialReactionLearningTask} from '/workspace/eduK12-new-version/server-version/frontend/src/modules/cognitive/tasks/serial-reaction-learning/SerialReactionLearningTask'
import {Instructions} from '/workspace/eduK12-new-version/server-version/frontend/src/modules/cognitive/tasks/serial-reaction-learning/Instructions'
import {Report} from '/workspace/eduK12-new-version/server-version/frontend/src/modules/cognitive/tasks/serial-reaction-learning/Report'
import {digest,type Context,type Draft,type Ports} from '/workspace/eduK12-new-version/server-version/frontend/src/modules/cognitive/tasks/serial-reaction-learning/contracts'
import type {Language} from '/workspace/eduK12-new-version/server-version/frontend/src/modules/cognitive/tasks/serial-reaction-learning/generated/protocol'
import fixture from './browser-fixture.json'
const context=fixture.context as Context,records:Draft[]=[],root=createRoot(document.getElementById('root')!)
const ports:Ports={prepareLocalAttempt:async(c,manifest,realm)=>({fresh:true,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})}),persistLocalDraft:async record=>{const old=records.find(r=>r.recordKey===record.recordKey);if(old&&old.recordDigest!==record.recordDigest)throw Error('Conflicting synthetic original');if(!old)records.push(structuredClone(record));return {retained:true,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}},finalize:async claim=>{const report=await (window as any).fixtureFinalize({context,records,claim});return {finalSaved:true,contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,receiptId:'synthetic-local-core-only-not-archive',report}}}
;(window as any).srlFixture={...fixture,records,showReport:(name:keyof typeof fixture.reports)=>root.render(<Report report={fixture.reports[name] as any} language="zh"/>),showInstructions:(language:Language)=>root.render(<main className="srl-task"><Instructions config={context.snapshot.config} language={language}/></main>)}
root.render(<React.StrictMode><SerialReactionLearningTask context={context} ports={ports}/></React.StrictMode>)
