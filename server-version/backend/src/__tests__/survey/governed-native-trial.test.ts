import {afterAll,describe,expect,it,vi} from 'vitest'
import {adaptCatalogSjt} from '../../modules/survey/catalog.sources'
import {artifactBlockers,artifactReference,snapshotUnit,type GovernedArtifact} from '../../modules/survey/governed-tool.model'
import {computeGovernedTrial} from '../../modules/survey/governed-tool.trial'
import {compileSjtNativeV1Fixture} from '../fixtures/sjt-native-v1.fixture'
import {createSjtNativeStagedPackage} from '../fixtures/sjt-native-staged.fixture'
vi.mock('../../modules/situational/onboarding/scientific-registry',async original=>{
 const actual=await original<typeof import('../../modules/situational/onboarding/scientific-registry')>()
 const fixture=await import('../fixtures/sjt-native-v1.fixture')
 return {...actual,getSituationalScientificDeclaration:(key:string,version:string)=>key===fixture.SJT_NATIVE_V1_FIXTURE_KEY?fixture.createSjtNativeV1ScientificDeclaration():actual.getSituationalScientificDeclaration(key,version)}
})
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('governed native SJT retains shared execution and scoring',()=>{
 for(const pkg of [compileSjtNativeV1Fixture().package,createSjtNativeStagedPackage()]){
  it('runs the exact native v'+pkg.definition.schemaVersion+' synthetic protocol, report and receipt decoder',()=>{
   const source=adaptCatalogSjt({kind:'SJT',sourceId:'registry:'+pkg.key,sourceVersion:pkg.instrumentVersion},'Synthetic',{...pkg,releaseStatus:'PUBLISHED'})
   const unit=snapshotUnit(source)
   expect(unit.executionProtocol).toBe('SITUATIONAL_NATIVE_V1');expect(unit.nativeSituational).toEqual(source.nativeSituational)
   const a:GovernedArtifact={schemaVersion:1,family:'SJT',toolKey:'synthetic',version:'1',title:'Synthetic',unit:source,parameters:null,report:{version:'report-1',template:{title:'Synthetic',blocks:[{type:'METRIC',metricKey:'coordination',display:'RAW'}],limitations:[]}},components:[],packageReport:null,reference:artifactReference('SJT','synthetic',{})}
   expect(artifactBlockers(a)).toEqual([])
   for(const index of [0,1,2]){
    const trial=computeGovernedTrial(a,'synthetic',index),result=trial.result.calculated.units[0]
    expect(trial.result.answers.tool).toEqual({})
    expect(result.nativeReference?.protocol).toBe('SITUATIONAL_NATIVE_V1')
    expect(result.measurement!.metrics.find(m=>m.key==='coordination')?.value).toBe(pkg.definition.schemaVersion===1?(index%2===0?2.5:.5):(index%2===0?5:1))
    const raw=trial.result.rawNative.tool as {raw:{researchCapture?:unknown};canonicalResult:{resultHash:string}}
    expect(Boolean(raw.raw.researchCapture)).toBe(pkg.definition.schemaVersion===2)
    expect(raw.canonicalResult.resultHash).toMatch(/^[a-f0-9]{64}$/)
    expect(trial.result.report!.blocks).toHaveLength(1)
   }
  })
 }
})
