import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {packageBoundCatalogSnapshots,assertFrozenPackageAdmissions} from '../../modules/survey/governed-package.service'
import type {CatalogSourceSnapshot} from '../../modules/survey/catalog.sources'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
const mocked=vi.hoisted(()=>({strict:vi.fn(),read:vi.fn()}))
vi.mock('../../modules/survey/governed-tool.service',()=>({assertGovernedEntryAllowed:mocked.strict,governedRow:mocked.read,governedFail:(statusCode:number,message:string)=>{throw Object.assign(new Error(message),{statusCode})}}))
const source=(key:string)=>({ref:{kind:'FORM',sourceId:key,sourceVersion:'1'},provenance:{},compiledDefinition:{key},displayDefinition:{key}})
const tool={id:'tool',snapshot_hash:'hash',snapshot:{components:['a','b'].map(slotKey=>({slotKey,unit:source(slotKey)}))}}
const grant={id:'grant',tool_id:'tool',snapshot_hash:'hash',status:'ACTIVE',valid_from:new Date(0),expires_at:null}
const rows=['a','b'].map(slot_key=>({technical_grant_id:slot_key,draft_id:slot_key,slot_key,import_id:'import',grant_id:'grant',project_id:'project',tool_id:'tool',snapshot_hash:'hash'}))
const map=()=>new Map(rows.map(r=>[r.technical_grant_id,{...source(r.slot_key),provenance:{packageBindingIdentity:{importId:r.import_id,draftId:r.draft_id,slotKey:r.slot_key}}} as unknown as CatalogSourceSnapshot]))
const tx=(active=true)=>({$queryRaw:vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([grant]).mockResolvedValueOnce(active?[{now:new Date()}]:[])})
beforeEach(()=>{mocked.strict.mockReset().mockResolvedValue(tool);mocked.read.mockReset().mockResolvedValue(tool)})
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('exact package proofs live only inside one transaction call',()=>{
 it.each(['REVOKED','EXPIRED'])('checks a later %s grant even when its exact tool is already verified',async status=>{
  const second={...grant,id:'grant2',...(status==='REVOKED'?{status:'REVOKED'}:{expires_at:new Date(0)})}
  const fake={$queryRaw:vi.fn().mockResolvedValueOnce([{owner_user_id:'owner'}]).mockResolvedValueOnce([grant]).mockResolvedValueOnce([{now:new Date()}]).mockResolvedValueOnce([second]).mockResolvedValueOnce([{now:new Date()}])}
  await expect(assertFrozenPackageAdmissions(fake as never,{projectId:'project',governedPackages:['grant','grant2'].map(parentGrantId=>({parentGrantId,toolId:'tool',hash:'hash'}))} as ResearchFrozenPublication)).rejects.toMatchObject({statusCode:403})
  expect(mocked.strict).toHaveBeenCalledTimes(1)
 })
 it('reuses the locked exact parent for all members and rechecks authority next request',async()=>{
  await packageBoundCatalogSnapshots(tx() as never,'owner',map(),true)
  expect(mocked.strict).toHaveBeenCalledTimes(1);expect(mocked.read).not.toHaveBeenCalled()
  await packageBoundCatalogSnapshots(tx() as never,'owner',map(),true)
  expect(mocked.strict).toHaveBeenCalledTimes(2)
 })
 it('still verifies every component and its package-binding identity',async()=>{
  const changed=map();changed.get('b')!.compiledDefinition={changed:true}
  await expect(packageBoundCatalogSnapshots(tx() as never,'owner',changed,true)).rejects.toMatchObject({statusCode:409})
  const identity=map();identity.get('b')!.provenance.packageBindingIdentity={importId:'wrong'}
  await expect(packageBoundCatalogSnapshots(tx() as never,'owner',identity,true)).rejects.toMatchObject({statusCode:409})
 })
 it('preserves inactive historical reads but hashes their exact parent once',async()=>{
  await packageBoundCatalogSnapshots(tx(false) as never,'owner',map(),false)
  expect(mocked.strict).not.toHaveBeenCalled();expect(mocked.read).toHaveBeenCalledTimes(1)
 })
 it('does not reuse a parent for a different grant hash',async()=>{
  const fake=tx();fake.$queryRaw.mockReset().mockResolvedValueOnce([{...rows[0],snapshot_hash:'other'}]).mockResolvedValueOnce([grant]).mockResolvedValueOnce([{now:new Date()}])
  await expect(packageBoundCatalogSnapshots(fake as never,'owner',map(),true)).rejects.toMatchObject({statusCode:409})
 })
 it('reads the project owner once while checking every live package grant',async()=>{
  const fake={$queryRaw:vi.fn().mockResolvedValueOnce([{owner_user_id:'owner'}]).mockResolvedValueOnce([grant]).mockResolvedValueOnce([{now:new Date()}]).mockResolvedValueOnce([{...grant,id:'grant2'}]).mockResolvedValueOnce([{now:new Date()}])}
  await assertFrozenPackageAdmissions(fake as never,{projectId:'project',governedPackages:['grant','grant2'].map(parentGrantId=>({parentGrantId,toolId:'tool',hash:'hash'}))} as ResearchFrozenPublication)
  expect(fake.$queryRaw).toHaveBeenCalledTimes(5);expect(mocked.strict).toHaveBeenCalledTimes(1)
 })
})
