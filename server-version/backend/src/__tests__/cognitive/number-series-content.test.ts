import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {sha256} from '../../modules/cognitive/v2/canonical'
import {createNumberSeriesSnapshot,numberSeriesDefinition} from '../../modules/cognitive/content-candidates/number-series/package'
import {BANK_HASH,BANK_VERSION,ITEMS,FAMILIES,predictions} from '../../modules/cognitive/content-candidates/number-series/items'
import {numberSeriesPlan as planFor,numberSeriesConfig as configFor,type NumberSeriesRaw,type NumberSeriesPlan,type Family} from '../../modules/cognitive/content-candidates/number-series/protocol'
import {scoreNumberSeries,numberSeriesEnvelope} from '../../modules/cognitive/content-candidates/number-series/scorer'
import {projectNumberSeriesReport,isNumberSeriesReport,numberSeriesReportText,numberSeriesTakeHomeSvg} from '../../modules/cognitive/content-candidates/number-series/report'
import {difference,rate,median} from '../../modules/cognitive/content-candidates/number-series/analysis'
import {createNumberSeriesPresentation} from '../../modules/cognitive/content-candidates/number-series/participant-presentation'
const seed='original-number-series-科研'
const snapshot=(profile:'research'|'experience'='experience')=>createNumberSeriesSnapshot(profile,'2026-10-27T00:00:00.000Z')
function raw(plan:NumberSeriesPlan,choice:number|null=plan.correctIndex,kind:'answer'|'skip'|'interrupt'='answer',rt=100):NumberSeriesRaw {
  const start=100+plan.index*10_000,at=start+rt
  return {plan:structuredClone(plan),startedAtPerfMs:start,endedAtPerfMs:at,status:kind==='answer'?'answered':kind==='skip'?'skipped':'interrupted',response:kind==='answer'?choice:null,rtMs:kind==='answer'?rt:null,input:kind==='interrupt'?null:'keyboard',stopReason:kind==='interrupt'?'window-blur':null,events:kind==='answer'?[{kind:'answer',atMs:at,choice:choice!,input:'keyboard',key:'Digit'+(choice!+1)}]:kind==='skip'?[{kind:'skip',atMs:at,input:'keyboard'}]:[{kind:'interrupt',atMs:at,reason:'window-blur'}],ignoredRepeatCount:0}
}
function score(rows?:NumberSeriesRaw[],profile:'research'|'experience'='experience') {
  const s=snapshot(profile)
  return scoreNumberSeries({session:s,config:s.config,randomSeed:seed,trials:(rows??planFor(s.config,seed).map(p=>raw(p))).map(numberSeriesEnvelope)})
}
describe('number-series original content and authoritative outcomes',()=>{
  it('keeps an original 24-item bank, defensible model answers, distinct distractors and frozen bilingual module copies',()=>{
    expect(ITEMS).toHaveLength(24);expect(sha256({bankVersion:BANK_VERSION,items:ITEMS})).toBe(BANK_HASH)
    for(const item of ITEMS){expect(predictions(item.known)).toEqual([{family:item.family,answer:item.answer}]);expect(new Set([item.answer,...item.distractors.map(d=>d.value)]).size).toBe(4);expect(item.distractors.every(d=>Boolean(d.reason))).toBe(true)}
    const root=join(process.cwd(),'..')
    for(const file of ['items.ts','protocol.ts','analysis.ts','report.ts'])expect(readFileSync(join(root,'frontend/src/modules/cognitive/tasks/number-series/generated',file),'utf8')).toBe(readFileSync(join(root,'backend/src/modules/cognitive/content-candidates/number-series',file),'utf8'))
  })
  it('preserves three conditions and correct-position balance per profile and six-item block, with the short version a fixed subset',()=>{
    const shortIDs=new Set(ITEMS.filter(i=>i.short).map(i=>i.id))
    for(const profile of ['research','experience'] as const)for(const s of [seed,'alternate','emoji-🧠']) {
      const c=configFor(profile),p=planFor(c,s);expect(p).toEqual(planFor(c,s));expect(new Set(p.map(x=>x.itemId)).size).toBe(c.totalItems)
      for(const f of FAMILIES){const group=p.filter(x=>x.family===f);expect(group).toHaveLength(c.itemsPerCondition);for(let option=0;option<4;option++)expect(group.filter(x=>x.correctIndex===option)).toHaveLength(c.itemsPerCondition/4)}
      for(let b=0;b<c.totalItems/6;b++)for(const f of FAMILIES)expect(p.filter(x=>x.blockIndex===b&&x.family===f)).toHaveLength(2)
      if(profile==='experience')expect(new Set(p.map(x=>x.itemId))).toEqual(shortIDs)
      const practice=planFor(c,s,'practice',2);expect(practice.map(x=>x.answer)).toEqual([5,16,11]);expect(practice.every(x=>x.round===2&&x.phase==='practice')).toBe(true)
      expect(p.every(x=>x.round===0&&x.phase==='test')).toBe(true)
    }
    expect(planFor(configFor('research'),seed)).not.toEqual(planFor(configFor('research'),'another'))
  })
  it('scores real condition denominators, true zero and null separately without an ability index',()=>{
    const p=planFor(snapshot().config,seed),seen:Record<Family,number>={addition:0,multiplication:0,'growing-gap':0},limits:Record<Family,number>={addition:3,multiplication:2,'growing-gap':4}
    const result=score(p.map(item=>raw(item,seen[item.family]++<limits[item.family]?item.correctIndex:(item.correctIndex+1)%4,'answer',0)))
    expect(result.quality.state).toBe('interpretable');expect(result.metrics.counts).toMatchObject({correct:9,wrong:3,opportunities:12,skipped:0,unpresented:0})
    expect(result.metrics.growingMinusAdditionAccuracy).toBe(.25);expect(result.metrics.correctRtMs).toBe(0)
    const report=projectNumberSeriesReport(result);expect(report.summary).toMatchObject({correct:9,opportunities:12,correctRtMs:0});expect(numberSeriesReportText(report,'en')).toContain('0 seconds');expect(numberSeriesTakeHomeSvg(report,'zh')).toContain('EDUK12.TOP')
    const allWrong=score(p.map(item=>raw(item,(item.correctIndex+1)%4)))
    expect(allWrong.quality.state).toBe('interpretable');expect(allWrong.metrics.accuracy).toBe(0);expect(allWrong.metrics.correctRtMs).toBeNull();expect(projectNumberSeriesReport(allWrong).summary?.correct).toBe(0)
    const allSkip=score(p.map(item=>raw(item,null,'skip')));expect(allSkip.quality.state).toBe('interpretable');expect(projectNumberSeriesReport(allSkip).summary).toMatchObject({correct:0,skipped:12,correctRtMs:null})
    expect(rate(0,4)).toBe(0);expect(rate(0,0)).toBeNull();expect(median([])).toBeNull();expect(difference(0,.5)).toBe(-.5);expect(difference(null,0)).toBeNull()
  })
  it('does not turn unpresented or interrupted questions into errors and keeps signed condition differences',()=>{
    const p=planFor(snapshot().config,seed),partial=score([raw(p[0],null,'skip'),raw(p[1],null,'interrupt')])
    expect(partial.metrics.counts).toMatchObject({received:2,opportunities:1,correct:0,wrong:0,skipped:1,interrupted:1,unpresented:10})
    expect(partial.metrics.growingMinusAdditionAccuracy).toBeNull();expect(partial.quality.state).toBe('limited')
    const negative=score(p.map(item=>raw(item,item.family==='growing-gap'?(item.correctIndex+1)%4:item.correctIndex)))
    expect(negative.metrics.growingMinusAdditionAccuracy).toBe(-1)
    const times=score(p.map(item=>raw(item,item.correctIndex,'answer',item.family==='growing-gap'?1:1000)))
    expect(times.metrics.growingMinusAdditionRtMs).toBe(-999)
  })
  it('uses the same restrictive projection for text, image and download; internal fields never survive public states',()=>{
    const p=planFor(snapshot().config,seed)
    for(const result of [score([raw(p[0])]),score([]),score([raw(p[0],null,'interrupt')])]){
      const report=projectNumberSeriesReport(result);expect(report.summary).toBeNull();expect(numberSeriesTakeHomeSvg(report,'zh')).toBeNull()
      expect(JSON.stringify(report)).not.toMatch(/growingMinus|conditionRates|technicalInterruption|correctRtMs|"correct"/)
      expect(numberSeriesReportText(report,'en')).not.toContain('Correct:')
      expect(isNumberSeriesReport({...report,summary:{correct:0}})).toBe(false)
    }
    const result=score(),good=projectNumberSeriesReport(result)
    expect(isNumberSeriesReport({...good,internalMetrics:result.metrics})).toBe(false)
    expect(isNumberSeriesReport({...good,reportDefinitionVersion:'next'})).toBe(false)
    expect(()=>projectNumberSeriesReport({...result,quality:{...result.quality,state:'limited'}})).toThrow()
    expect(()=>projectNumberSeriesReport({...result,metrics:{...result.metrics,reportBinding:{...(result.metrics.reportBinding as object),scoringVersion:'next'}}})).toThrow()
    expect(Object.values(numberSeriesDefinition.metrics).every(m=>m.visibility==='research_only'&&!m.referenceEligible&&!m.export.summary)).toBe(true)
    expect(createNumberSeriesPresentation().hiddenMetrics).toEqual(Object.keys(numberSeriesDefinition.metrics))
  })
  it('rejects changed frozen identities, bank/answer tampering, duplicate order, mismatched first responses and bad clocks',()=>{
    const s=snapshot(),p=planFor(s.config,seed),first=raw(p[0]),call={session:s,config:s.config,randomSeed:seed,trials:[numberSeriesEnvelope(first)]}
    expect(()=>scoreNumberSeries({...call,session:{...s,scoringVersion:'next'}})).toThrow()
    expect(()=>scoreNumberSeries({...call,config:{...s.config,bankHash:'wrong'} as never})).toThrow()
    const changed=structuredClone(first);changed.response=(changed.response!+1)%4
    expect(()=>score([changed])).toThrow('first response')
    const answer=structuredClone(first);answer.plan.correctIndex=(answer.plan.correctIndex+1)%4;expect(()=>score([answer])).toThrow('frozen item')
    expect(()=>score([first,first])).toThrow()
    const keyboard=structuredClone(first);(keyboard.events[0] as {key:string}).key='Digit9';expect(()=>score([keyboard])).toThrow('mapping')
    const time=numberSeriesEnvelope(first);time.durationMs++;expect(()=>scoreNumberSeries({...call,trials:[time]})).toThrow('envelope')
    expect(()=>planFor(s.config,seed,'test',1)).toThrow();expect(()=>configFor('standard' as never)).toThrow()
    expect(Object.isFrozen(s.config.practice)).toBe(true);expect(Object.isFrozen(s.protocol)).toBe(true)
    const long=score(undefined,'research');expect(long.quality.state).toBe('interpretable');expect(long.metrics.counts).toMatchObject({planned:24,correct:24})
  })
})
