/** Synthetic local rendering fixture only. These memory ports are NOT an API/DB/COS adapter. */
import React from 'react'
import {createRoot} from 'react-dom/client'
import {NumberSeriesTask} from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/number-series/NumberSeriesTask'
import {NumberSeriesReport} from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/number-series/NumberSeriesReport'
import {NumberSeriesInstructions} from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/number-series/NumberSeriesInstructions'
import {digest,numberSeriesManifest,type NumberSeriesPorts,type NumberSeriesContext} from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/number-series/contracts'
import type {NumberSeriesReport as Report,Language} from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/number-series/generated/report'
import fixture from './browser-fixture.json'
const context=fixture.context as NumberSeriesContext,root=createRoot(document.getElementById('root')!)
let prepared=false
const records=new Map()
const ports:NumberSeriesPorts={
  async prepareLocalAttempt(c,manifest,realm){if(prepared)throw Error('Synthetic fixture already prepared');prepared=true;return {fresh:true,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})}},
  async persistLocalDraft(record){records.set(record.recordKey,structuredClone(record));return {retained:true,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}},
  async finalize(){throw Error('Browser fixture has no server finalization; report rendering uses separately generated authoritative synthetic examples')},
}
const fixtureAPI={
  practice:numberSeriesManifest(context).practice[0],
  practiceRounds:numberSeriesManifest(context).practice,
  showReport(state:keyof typeof fixture.reports,language:Language='zh'){root.render(<NumberSeriesReport report={fixture.reports[state] as Report} language={language}/>)},
  showInstructions(language:Language){root.render(<NumberSeriesInstructions config={context.snapshot.config} language={language}/>)},
}
Object.assign(window,{numberSeriesBrowserFixture:fixtureAPI})
root.render(<NumberSeriesTask context={context} ports={ports}/>)
