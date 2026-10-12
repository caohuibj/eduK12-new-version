import {describe,expect,it} from 'vitest'
import {STANDARD,ENHANCED} from '../modules/report-privacy/registry'
import {projectCampusGeneralGroupV2} from '../modules/campus/generalGroupV2.projection'

const source={
  kind:'GROUP',state:'present',eligibleN:6,resultContributorN:5,
  metrics:{participation:{state:'present',validN:5,missingN:1,
    aggregations:{mean:3.225,median:3.2,sdPopulation:0.43,distribution:{
      state:'present',cells:[{value:1,count:1},{value:5,count:4}]}}}},
}
const calc=(projection:unknown,options=STANDARD,minimumN=5)=>
  projectCampusGeneralGroupV2({artifactId:'artifact-test',projection,options,
    minimumN,metricMinimums:{participation:5}})
describe('Huischool PR3 approved general group aggregate V2 projection',()=>{
  it('permits n=5 of N=6 when the reviewed science floor is 5, not personal responses',()=>{
    const p=calc(source)
    expect(p.state).toBe('READY')
    expect(p.metrics.participation).toMatchObject({mean:3.23,validN:5,
      missingN:1,median:3.2,sdPopulation:0.43})
    expect(p.participantN).toBe(6)
    expect(JSON.stringify(p)).not.toContain('distribution')
    expect(JSON.stringify(p)).not.toContain('"value":1')
  })
  it('enhanced/forced privacy and science floors override standard preference',()=>{
    expect(calc(source,ENHANCED).state).toBe('WITHHELD')
    expect(calc(source,STANDARD,10).state).toBe('WITHHELD')
    expect(calc(source,{...STANDARD,requireAllCompleted:true}).state).toBe('WITHHELD')
    expect(calc(source,{...STANDARD,protectSmallNonrespondentComplement:true}).state).toBe('WITHHELD')
  })
  it('aggregate-only restricted precision avoids exact counts and extra statistics',()=>{
    const p=calc({...source,eligibleN:7,resultContributorN:7,
      metrics:{participation:{state:'present',validN:7,missingN:0,
        aggregations:{mean:3.225,median:3,sdPopulation:1}}}},
      {...STANDARD,restrictedStatisticsProjection:true})
    expect(p).toMatchObject({state:'READY',participantN:null,completedN:null,
      metrics:{participation:{mean:3.2}}})
    expect(p.metrics.participation).not.toHaveProperty('validN')
    expect(p.metrics.participation).not.toHaveProperty('median')
  })
  it('never exposes metrics outside the published scientific spec',()=>{
    const compromised={...source,metrics:{...source.metrics,
      unreviewedSensitiveResult:{state:'present',validN:5,missingN:1,
        aggregations:{mean:99.5,median:99.5}},
    }}
    const p=calc(compromised)
    expect(p.state).toBe('READY')
    expect(Object.keys(p.metrics)).toEqual(['participation'])
    expect(JSON.stringify(p)).not.toContain('unreviewedSensitiveResult')
    expect(JSON.stringify(p)).not.toContain('99.5')
  })
  it('incomplete or inconsistent numbers and unapproved metrics are withheld',()=>{
    expect(calc({...source,resultContributorN:4}).state).toBe('WITHHELD')
    expect(calc({...source,kind:'STUDENT_PERSONAL'}).state).toBe('WITHHELD')
    expect(calc({...source,metrics:{participation:{state:'present',validN:9,
      missingN:0,aggregations:{mean:1}}}}).state).toBe('WITHHELD')
    expect(calc({...source,metrics:{participation:{state:'suppressed'}}}).state)
      .toBe('WITHHELD')
  })
})
