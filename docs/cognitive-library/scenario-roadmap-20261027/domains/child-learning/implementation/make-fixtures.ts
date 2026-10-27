import {writeFileSync} from 'node:fs'
import {sha256} from '/workspace/eduK12-new-version/server-version/backend/src/modules/cognitive/v2/canonical'
import {createNumberSeriesSnapshot} from '/workspace/eduK12-new-version/server-version/backend/src/modules/cognitive/content-candidates/number-series/package'
import {numberSeriesPlan, type NumberSeriesPlan, type NumberSeriesRaw} from '/workspace/eduK12-new-version/server-version/backend/src/modules/cognitive/content-candidates/number-series/protocol'
import {scoreNumberSeries,numberSeriesEnvelope} from '/workspace/eduK12-new-version/server-version/backend/src/modules/cognitive/content-candidates/number-series/scorer'
import {projectNumberSeriesReport,numberSeriesReportText,numberSeriesTakeHomeSvg} from '/workspace/eduK12-new-version/server-version/backend/src/modules/cognitive/content-candidates/number-series/report'
const root='/workspace/eduK12-new-version/docs/cognitive-library/scenario-roadmap-20261027/domains/child-learning/implementation'
const seed='synthetic-number-series-browser'
function raw(p:NumberSeriesPlan,correct=true):NumberSeriesRaw {const start=100+p.index*1000,choice=correct?p.correctIndex:(p.correctIndex+1)%4;return {plan:p,startedAtPerfMs:start,endedAtPerfMs:start+100,status:'answered',response:choice,rtMs:100,input:'touch',stopReason:null,events:[{kind:'answer',choice,input:'touch',key:null,atMs:start+100}],ignoredRepeatCount:0}}
const examples=[]
for(const profile of ['experience','research'] as const){const s=createNumberSeriesSnapshot(profile,'2026-10-27T00:00:00.000Z'),plan=numberSeriesPlan(s.config,seed),records=plan.map((p,i)=>raw(p,i%4!==0)),score=scoreNumberSeries({session:s,config:s.config,randomSeed:seed,trials:records.map(numberSeriesEnvelope)}),report=projectNumberSeriesReport(score)
 examples.push({profile,session:s,randomSeed:seed,manifestHash:sha256(plan),formalPlan:plan,records,score,publicReport:report})
 if(profile==='experience'){
  const context={contextKey:'synthetic-browser-number-series:epoch1',language:'zh',snapshot:s,randomSeed:seed,manifestHash:sha256(plan)}
  const limited=projectNumberSeriesReport(scoreNumberSeries({session:s,config:s.config,randomSeed:seed,trials:records.slice(0,1).map(numberSeriesEnvelope)})),invalid=projectNumberSeriesReport(scoreNumberSeries({session:s,config:s.config,randomSeed:seed,trials:[]}))
  writeFileSync(root+'/browser-fixture.json',JSON.stringify({synthetic:true,context,reports:{interpretable:report,limited,invalid}},null,2)+'\n')
  for(const language of ['zh','en'] as const)writeFileSync(root+'/synthetic-report-'+language+'.txt',numberSeriesReportText(report,language)+'\n')
  writeFileSync(root+'/synthetic-report.svg',numberSeriesTakeHomeSvg(report,'zh')!)
 }
}
writeFileSync(root+'/synthetic-worked-examples.json',JSON.stringify({synthetic:true,participantData:false,note:'Software fixtures only; all values authored, not observations or norms.',examples},null,2)+'\n')
console.log('Wrote synthetic 12/24 raw records, exact snapshots, internal scores and matching public reports; no participant data or archival claims.')
