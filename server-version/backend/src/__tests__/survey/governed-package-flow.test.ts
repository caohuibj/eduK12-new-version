import {afterAll,describe,expect,it,vi} from 'vitest'
import type {ResearchFrozenPublication,ResearchFrozenUnit} from '../../modules/survey/publication.service'
import {freezeGovernedPackages} from '../../modules/survey/governed-package.service'

const {tool}=vi.hoisted(()=>({tool:{id:'tool',snapshot_hash:'hash',family:'BUNDLE',title:'Package',snapshot:{packageReport:null,components:['a','b'].map(slotKey=>({slotKey,unit:{ref:{kind:'FORM'},compiledDefinition:{},displayDefinition:{}}}))}}}))
vi.mock('../../modules/survey/governed-tool.service',()=>({
 governedRow:vi.fn(async()=>tool),assertGovernedEntryAllowed:vi.fn(async()=>tool),
 governedFail:(statusCode:number,message:string)=>{throw Object.assign(new Error(message),{statusCode})},
}))
const units=['a','b'].map(key=>({draftId:key,instrumentKey:key,kind:'FORM',compiledDefinition:{},displayDefinition:{},sourceProvenance:{surveyPackage:{importId:'import'}}})) as ResearchFrozenUnit[]
const instrument=(key:string)=>({blockKey:key,kind:'INSTRUMENT',instrumentKey:key})
const flow=(blocks:unknown[],experiment?:unknown)=>({blocks,...(experiment?{experiment}:{})}) as ResearchFrozenPublication['flow']
function freeze(f:ResearchFrozenPublication['flow']){
 const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{grant_id:'grant',tool_id:'tool',project_id:'project',snapshot_hash:'hash',bindings:units.map(u=>({draftId:u.draftId,instrumentKey:u.instrumentKey,slotKey:u.instrumentKey}))}]).mockResolvedValueOnce([{id:'grant',tool_id:'tool',snapshot_hash:'hash',status:'ACTIVE',valid_from:new Date(0),expires_at:null}]).mockResolvedValueOnce([{now:new Date()}])}
 return freezeGovernedPackages(tx as never,'actor','project',units,f)
}
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('approved package uses actual Flow execution order',()=>{
 it('reproduces reversed flow despite correctly ordered instrumentIds and units',async()=>{await expect(freeze(flow([instrument('b'),instrument('a')]))).rejects.toMatchObject({statusCode:409})})
 it('rejects an external instrument between approved components',async()=>{await expect(freeze(flow([instrument('a'),instrument('outside'),instrument('b')]))).rejects.toMatchObject({statusCode:409})})
 it.each(['missing','duplicate'])('rejects %s execution',async mode=>{await expect(freeze(flow(mode==='missing'?[instrument('a')]:[instrument('a'),instrument('b'),instrument('a')]))).rejects.toMatchObject({statusCode:409})})
 it.each(['condition','end','experiment'])('retains the %s admission restriction',async mode=>{
  const blocks=mode==='end'?[instrument('a'),{blockKey:'end',kind:'END'},instrument('b')]:[{...instrument('a'),...(mode==='condition'?{when:{}}:{})},instrument('b')]
  await expect(freeze(flow(blocks,mode==='experiment'?{}:undefined))).rejects.toMatchObject({statusCode:409})
 })
 it('keeps existing unconditional material presentation without changing instrument order',async()=>{await expect(freeze(flow([instrument('a'),{blockKey:'material',kind:'MATERIAL'},instrument('b')]))).resolves.toHaveLength(1)})
 it('accepts original order, surrounding material and legacy unit-order execution',async()=>{
  await expect(freeze(flow([{blockKey:'intro',kind:'MATERIAL'},instrument('a'),instrument('b'),{blockKey:'end',kind:'END'}]))).resolves.toHaveLength(1)
  await expect(freeze(undefined)).resolves.toHaveLength(1)
 })
})
