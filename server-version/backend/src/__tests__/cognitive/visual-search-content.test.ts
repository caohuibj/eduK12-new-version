import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {searchConfig,searchPlan,initialSearchState,reduceSearchEvent,type SearchRaw,type SearchPlan,type SearchEvent} from '../../modules/cognitive/content-candidates/visual-search/protocol'
import {reviewSearch} from '../../modules/cognitive/content-candidates/visual-search/analysis'
import {createSearchSnapshot,searchDefinition} from '../../modules/cognitive/content-candidates/visual-search/package'
import {scoreSearch,searchEnvelope} from '../../modules/cognitive/content-candidates/visual-search/scorer'
import {projectSearchReport} from '../../modules/cognitive/content-candidates/visual-search/report'
import {createSearchPresentation} from '../../modules/cognitive/content-candidates/visual-search/participant-presentation'
const seed='approved-visual-search'
function complete(p:SearchPlan,start:number,control:string):SearchRaw{const c=searchConfig('experience'),raw:SearchRaw={plan:p,startedAtPerfMs:start,endedAtPerfMs:start+2300,status:'complete',stopReason:null,events:[],state:initialSearchState(),ignoredRepeatCount:0,overflow:false},events:SearchEvent[]=[{kind:'reveal',atMs:start+800}]
 for(const [at,kind,id] of [[1700,'down','done'],[1800,'up','done'],[2200,'down',control],[2300,'up',control]] as const)events.push({kind,atMs:start+at,control:id,token:'pointer:1',input:'touch',key:null,repeat:false,primary:true})
 for(const e of events){reduceSearchEvent(raw.state,e,p,c,start);raw.events.push(e)}return raw}
function fixture(profile:'research'|'experience'='experience',none=false){const session=createSearchSnapshot(profile),plan=searchPlan(session.config,seed);let now=100
 const trials=plan.map(p=>{const raw=complete(p,now,none||p.targetCount===0?'none':p.items.find(i=>i.target)!.id);now=raw.endedAtPerfMs+10;return searchEnvelope(raw)})
 return {session,config:session.config,randomSeed:seed,trials}}
describe('visual search minimal content contracts',()=>{
 it('freezes all 36 conditions in 180/36 profiles, exact target/foil counts and safe seeded mobile coordinates with three practice trials',()=>{
  for(const [profile,n,repeats] of [['research',180,5],['experience',36,1]] as const){const c=searchConfig(profile),plan=searchPlan(c,seed);expect(plan).toHaveLength(n);expect(searchPlan(c,seed)).toEqual(plan);expect(searchPlan(c,seed+'other')).not.toEqual(plan);expect(new Set(plan.map(p=>p.condition)).size).toBe(36)
   for(const p of plan){expect(plan.filter(x=>x.condition===p.condition)).toHaveLength(repeats);expect(p.items).toHaveLength(p.setSize);expect(new Set(p.items.map(i=>i.id)).size).toBe(p.setSize);expect(p.items.filter(i=>i.target)).toHaveLength(p.targetCount)
    const counts=[...'UDGCQ'].map(letter=>p.items.filter(i=>!i.target&&i.letter===letter).length);expect(Math.max(...counts)-Math.min(...counts)).toBeLessThanOrEqual(1)
    for(const item of p.items){expect(item.x).toBeGreaterThanOrEqual(22);expect(item.x).toBeLessThanOrEqual(278);expect(item.y).toBeGreaterThanOrEqual(22);expect(item.y).toBeLessThanOrEqual(338);if(item.target)expect([item.letter,item.colour]).toEqual([p.targetCharacter,p.targetColour]);else expect(item.colour).toBe('#FFFFFF')
     for(const other of p.items)if(item!==other)expect(Math.hypot(item.x-other.x,item.y-other.y)).toBeGreaterThanOrEqual(46)}
   }
   expect(createSearchSnapshot(profile).config.totalTrials).toBe(n);expect(createSearchPresentation().protocols?.[profile]?.profileLabel).toBe(profile==='research'?'科研版':'实用版')
   const practice=searchPlan(c,seed,'practice');expect(practice).toHaveLength(3);expect(practice.map(p=>p.targetCount)).toEqual([1,0,1]);expect(practice.every(p=>p.setSize===8)).toBe(true);expect(c.practice.minimumCorrect).toBe(3)
  }
  expect(()=>searchPlan({...searchConfig('experience'),totalTrials:18},seed)).toThrow();expect(()=>searchPlan(searchConfig('research'),seed,'practice',3)).toThrow()
 })
 it('scores NONE only when absent, accepts any one of five real targets and uses correct-only separate search/location time medians',()=>{
  for(const profile of ['research','experience'] as const){const f=fixture(profile),score=scoreSearch(f),r=projectSearchReport(score);expect(r).toMatchObject({state:'interpretable',valid:f.config.totalTrials,correct:f.config.totalTrials});for(const g of Object.values(r.bySetSize))expect(g).toMatchObject({medianSearchMs:1000,medianLocateMs:500});expect(Object.keys(score.metrics).every(k=>k in searchDefinition.metrics)).toBe(true)}
  const f=fixture('experience',true),r=projectSearchReport(scoreSearch(f));expect(r).toMatchObject({state:'interpretable',valid:36,correct:12});expect(r.byTargetCount['0'].correct).toBe(12);expect(r.byTargetCount['1']).toMatchObject({correct:0,medianSearchMs:null,medianLocateMs:null});expect(r.byTargetCount['5'].correct).toBe(0)
  const p=searchPlan(f.config,seed).find(p=>p.targetCount===5)!;for(const item of p.items.filter(i=>i.target))expect(reviewSearch(complete(p,100,item.id),p,f.config).correct).toBe(true)
  const absent=searchPlan(f.config,seed).find(p=>p.targetCount===0)!;expect(reviewSearch(complete(absent,100,absent.items[0].id),absent,f.config).correct).toBe(false)
 })
 it('keeps actual partial denominators and rejects forged coordinates, missing phases, guessed state and unknown frozen identities',()=>{
  const f=fixture(),raw=structuredClone(f.trials[1].payload);raw.status='interrupted';raw.stopReason='blur';raw.endedAtPerfMs=raw.startedAtPerfMs+2000;raw.events=raw.events.slice(0,3);raw.state=initialSearchState();for(const e of raw.events)reduceSearchEvent(raw.state,e,raw.plan,f.config,raw.startedAtPerfMs)
  expect(projectSearchReport(scoreSearch({...f,trials:[f.trials[0],searchEnvelope(raw)]}))).toMatchObject({state:'limited',received:2,valid:1,correct:1});expect(projectSearchReport(scoreSearch({...f,trials:[]}))).toMatchObject({state:'invalid',valid:0})
  const coord=structuredClone(f);coord.trials[0].payload.plan.items[0].x+=5;expect(()=>scoreSearch(coord)).toThrow('plan')
  const guessed=structuredClone(f);guessed.trials[0].payload.state.selection={kind:'item',id:'made-up'};expect(()=>scoreSearch(guessed)).toThrow('state')
  const phase=structuredClone(f);phase.trials[0].payload.events.shift();expect(()=>scoreSearch(phase)).toThrow();expect(()=>scoreSearch({...f,session:{...f.session,scoringVersion:'next'}})).toThrow()
  const score=scoreSearch(f);(score.metrics.reportBinding as Record<string,unknown>).reportDefinitionVersion='next';expect(()=>projectSearchReport(score)).toThrow()
 })
})
