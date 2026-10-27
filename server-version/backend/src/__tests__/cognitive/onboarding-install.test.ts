import {beforeEach,describe,expect,it,vi} from 'vitest'
const source=vi.hoisted(()=>({testType:'selected-task',configVersion:'1',engineVersion:'2',scoringVersion:'3',name:'Synthetic selected task',status:'PUBLISHED',config:{trials:2}}))
vi.mock('../../modules/cognitive/generated/seeds',()=>({cognitiveSeeds:[source]}))
vi.mock('../../modules/cognitive/v2/registry',()=>({getCognitiveV2TaskDefinition:()=>({})}))
vi.mock('../../modules/cognitive/library/product-readiness',()=>({evaluateCognitiveProductReadiness:()=>({ready:true,blockers:[]})}))
vi.mock('../../modules/cognitive/product-eligibility',()=>({assertCognitiveProductEligible:vi.fn()}))
import {planCognitiveConfigInstall,installCognitiveConfigs} from '../../modules/cognitive/onboarding/install'
const identity={testType:'selected-task',configVersion:'1',engineVersion:'2',scoringVersion:'3'}
const input={schemaVersion:1,items:[identity]}
function fixture(){
  let record:any=null
  const user={id:'admin',platformRole:'SYSTEM_ADMIN',isActive:true,isFrozen:false,expiresAt:null}
  const db:any={user:{findUnique:vi.fn(async()=>user)},cognitiveTestConfig:{
    findUnique:vi.fn(async()=>record),create:vi.fn(async({data})=>{record={id:'new-config',...data};return record}),
  },assessmentManagementEvent:{create:vi.fn(async()=>({id:'audit'}))}}
  db.$transaction=vi.fn(async(fn:any)=>fn(db))
  return {db,user,set:(value:any)=>{record=value},get:()=>record}
}
beforeEach(()=>vi.clearAllMocks())
describe('selected cognitive draft installation',()=>{
  it('previews without writes, creates only restricted drafts and is idempotent without republishing',async()=>{
    const f=fixture(),before=JSON.stringify(source)
    expect(await planCognitiveConfigInstall(f.db,input,'admin')).toMatchObject({mode:'PREVIEW',rows:[{action:'CREATE_DRAFT'}],hasBlocked:false})
    expect(f.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
    expect(f.db.assessmentManagementEvent.create).not.toHaveBeenCalled()
    expect(await installCognitiveConfigs(f.db,input,'admin')).toMatchObject({mode:'APPLY',rows:[{action:'CREATED_DRAFT',status:'DRAFT'}]})
    expect(f.get()).toMatchObject({status:'DRAFT',accessPolicy:'GRANT'})
    expect(await installCognitiveConfigs(f.db,input,'admin')).toMatchObject({rows:[{action:'ALREADY_PRESENT',status:'DRAFT'}]})
    expect(f.db.cognitiveTestConfig.create).toHaveBeenCalledTimes(1)
    expect(f.db.assessmentManagementEvent.create).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(source)).toBe(before)
  })
  it('preserves published lifecycle and rejects conflicts, duplicate identities and unregistered selections',async()=>{
    const f=fixture();f.set({id:'existing',...source,accessPolicy:'OPEN'})
    expect(await installCognitiveConfigs(f.db,input,'admin')).toMatchObject({rows:[{action:'ALREADY_PRESENT',status:'PUBLISHED'}]})
    expect(f.get().accessPolicy).toBe('OPEN')
    f.set({...f.get(),config:{trials:9}})
    expect(await installCognitiveConfigs(f.db,input,'admin')).toMatchObject({rows:[{action:'BLOCKED',reasons:['IMMUTABLE_CONFIG_CONFLICT']}]})
    expect(await planCognitiveConfigInstall(f.db,{schemaVersion:1,items:[identity,identity]},'admin')).toMatchObject({hasBlocked:true,rows:[{reasons:['DUPLICATE_CONFIG_SELECTION']},{reasons:['DUPLICATE_CONFIG_SELECTION']}]})
    f.set(null)
    const result=await installCognitiveConfigs(f.db,{schemaVersion:1,items:[{...identity,testType:'missing'},identity]},'admin')
    expect(result).toMatchObject({hasBlocked:true,rows:[{action:'BLOCKED',reasons:['CONFIG_SEED_NOT_REGISTERED']},{action:'CREATED_DRAFT'}]})
    expect(f.db.cognitiveTestConfig.create).toHaveBeenCalledTimes(1)
  })
  it('requires an active system administrator and an exact declared execution identity',async()=>{
    const f=fixture();f.user.isFrozen=true
    await expect(installCognitiveConfigs(f.db,input,'admin')).rejects.toThrow('ACTIVE_SYSTEM_ADMIN_REQUIRED')
    expect(f.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
    f.user.isFrozen=false
    expect(await planCognitiveConfigInstall(f.db,{schemaVersion:1,items:[{...identity,scoringVersion:'wrong'}]},'admin')).toMatchObject({hasBlocked:true,rows:[{action:'BLOCKED',reasons:['EXECUTION_IDENTITY_MISMATCH']}]})
  })
})
