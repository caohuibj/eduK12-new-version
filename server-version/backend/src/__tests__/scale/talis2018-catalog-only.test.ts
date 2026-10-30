import {describe,it,expect} from 'vitest'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {readSelectedSource,checkSelectedSource} from '../../../scripts/scale-intake-selected-check'
import {createScaleInstrumentRegistry} from '../../modules/scale/onboarding/instrument-registry'
const root=path.resolve(__dirname,'../../../../..')
const keys=['talis2018_classroom_management_efficacy_zh_cn','talis2018_instruction_efficacy_zh_cn','talis2018_student_engagement_efficacy_zh_cn']
describe('TALIS2018 unresolved third-party item catalog',()=>{
  it.each(keys)('keeps %s discoverable without executable content, scores or runtime policy',async key=>{
    const file=`server-version/backend/src/modules/scale/instruments/${key}/1.0.0/instrument.ts`
    const source=await readSelectedSource(file,file=>readFileSync(path.join(root,file),'utf8'))
    const checked=checkSelectedSource(source)
    expect(checked).toMatchObject({status:'CATALOG_ONLY',administrable:false,goldenCases:0,scoringExecutions:0})
    expect(source.executable).toBeUndefined()
    expect(source.disclosure).toBeUndefined()
    expect(source.instruction).toBeUndefined()
    const registry=createScaleInstrumentRegistry([source])
    expect(registry.listCatalogEntries()).toHaveLength(1)
    expect(registry.getSource(key,'1.0.0')).toBeDefined()
    expect(registry.getExecutable(key,'1.0.0')).toBeUndefined()
    expect(registry.getRuntimePolicy(key,'1.0.0')).toBeUndefined()
    if(process.env.TALIS_EVIDENCE_DIR){
      mkdirSync(process.env.TALIS_EVIDENCE_DIR,{recursive:true})
      writeFileSync(path.join(process.env.TALIS_EVIDENCE_DIR,key+'.catalog.json'),JSON.stringify({node:process.version,checked,catalogOnly:true,noExecutable:true,noRuntimePolicy:true},null,2)+'\n')
    }
  })
})
