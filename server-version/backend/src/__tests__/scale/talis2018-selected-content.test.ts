import {describe,it,expect,vi} from 'vitest'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {readSelectedSource,checkSelectedSource} from '../../../scripts/scale-intake-selected-check'
import * as results from '../../modules/scale/scale-result'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'

const originalBuild=results.buildScaleResult
const root=path.resolve(__dirname,'../../../../..')
const tools=[
  ['talis2018_classroom_disruption_zh_cn',['TT3G41A','TT3G41B','TT3G41C','TT3G41D'],3],
  ['talis2018_stakeholder_participation_zh_cn',['TT3G48A','TT3G48B','TT3G48C','TT3G48D','TT3G48E'],2.8],
  ['talis2018_professional_development_barriers_zh_cn',['TT3G28A','TT3G28B','TT3G28C','TT3G28E','TT3G28F'],2.8],
  ['talis2018_teacher_exchange_zh_cn',['TT3G33D','TT3G33E','TT3G33F','TT3G33G'],3.5],
] as const

describe('TALIS2018 selected independent content',()=>{
  it.each(tools)('consumes %s once per distinct input and preserves its independent project scoring/report identity',async(key,itemIds,handMean)=>{
    const file=`server-version/backend/src/modules/scale/instruments/${key}/1.0.0/instrument.ts`
    const source=await readSelectedSource(file,file=>readFileSync(path.join(root,file),'utf8'))
    expect(source.executable!.definition.items.map(i=>i.itemCode)).toEqual(itemIds)
    const captures:Array<{answers:Parameters<typeof originalBuild>[0]['answers'];result:results.ScaleResultV2}>=[]
    const spy=vi.spyOn(results,'buildScaleResult').mockImplementation(input=>{
      const result=originalBuild(input)
      captures.push({answers:structuredClone(input.answers),result})
      return result
    })
    try{
      const checked=checkSelectedSource(source)
      expect(checked.scoringExecutions).toBe(captures.length)
      expect(new Set(captures.map(c=>canonicalHash(c.answers))).size).toBe(captures.length)
      const mixed=source.executable!.goldenCases.find(c=>c.name==='mixed')!
      const sample=captures.find(c=>canonicalHash(c.answers)===canonicalHash(mixed.answers))!.result
      // Independent hand arithmetic: DISC (1+4+3+4)/4; STAKE/BAR 14/5; EXCH 14/4.
      expect(sample.scores[0].value).toBe(handMean)
      expect(sample.method.reportAudience).toBe('teacher')
      expect(sample.references).toEqual([])
      expect(sample.interpretations).toHaveLength(1)
      expect(sample.interpretations[0].label).toBeNull()
      expect(sample.interpretations[0].limitations.join(' ')).toContain('不是OECD因子分')
      expect(source.disclosure!.audiences.subject!.scoreDerivedLabels).toBe(false)
      if(key==='talis2018_classroom_disruption_zh_cn'){
        expect(source.executable!.definition.scoring.itemRules.find(r=>r.itemCode==='TT3G41B')!.transform.type).toBe('reverse')
        expect(source.instruction!.text).toContain('上周二上午11点以后')
        expect(source.instruction!.text).toContain('完全/主要针对有特殊教育需要')
      }
      if(key==='talis2018_teacher_exchange_zh_cn'){
        expect(source.executable!.definition.responseSets[0].options.map(o=>o.label)).toEqual(['从未有过','每年1次或更少','每年 2-4 次','每年 5-10 次','每月1-3次','每周1次或更多'])
        expect(sample.interpretations[0].interpretation).toContain('均分不是每周或每年的实际次数')
      }
      if(process.env.TALIS_EVIDENCE_DIR){
        mkdirSync(process.env.TALIS_EVIDENCE_DIR,{recursive:true})
        writeFileSync(path.join(process.env.TALIS_EVIDENCE_DIR,key+'.json'),JSON.stringify({node:process.version,checked,captures,sample},null,2)+'\n')
      }
    }finally{spy.mockRestore()}
  })
})
