import {describe,expect,it} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {standardAxisHashes,standardCombinationHash,standardCombinationMeasurementInput} from '../../modules/measurement-content/standard-combination'
import {tripletSnapshot,type Triplet} from '../../modules/survey/standard-triplet.model'
import {toolReference} from '../../modules/survey/tool-reference'
import {combinationFixture} from './standard-combination.fixture'
import golden from './standard-combination-legacy.json'
import {computeStandardTrial} from '../../modules/survey/standard-triplet.service'

// Captured by executing the unmodified 6fedb640 model/producer on synthetic
// definitions in a git archive. Never approved, published, installed or trialled.
describe('existing source identity survives shared mapping extraction',()=>{
  it('keeps the original C/P/R combination digest',()=>{
    const {row}=combinationFixture()
    expect(standardCombinationHash(row.tool_key,standardAxisHashes(row.snapshot.parts))).toBe(golden.combinationHash)
  })
  it('keeps every byte of the canonical Survey source snapshot and provenance',()=>{
    const {row}=combinationFixture(),reference=toolReference('SCALE',row.tool_key,{synthetic:true})
    const t:Triplet={...row.snapshot,title:'合成版本映射',references:[],template:null,blockers:[],schemaVersion:1,reference,
      parts:{CONTENT:{...row.snapshot.parts.CONTENT,reference},PARAMETERS:{...row.snapshot.parts.PARAMETERS,reference},REPORT:{...row.snapshot.parts.REPORT,reference}}}
    expect(canonicalHash(tripletSnapshot(t,row.id,row.measurement_release!))).toBe(golden.canonicalSnapshotHash)
  })
  it('keeps the original platform measurement input identity',()=>{
    expect(canonicalHash(standardCombinationMeasurementInput(combinationFixture().row))).toBe(golden.platformMeasurementInputHash)
  })
  it('runs a valid chart-only declared report over an unchanged legacy C definition',()=>{
    const {row}=combinationFixture(),reference=toolReference('SCALE',row.tool_key,{synthetic:true})
    const template={title:'合成图表报告',blocks:[{type:'CHART' as const,metricKeys:[row.snapshot.definition.scoring.scores[0].key],style:'TABLE' as const}],limitations:[]}
    const payload={definition:row.snapshot.definition.report,template}
    const parts={CONTENT:{...row.snapshot.parts.CONTENT,reference},PARAMETERS:{...row.snapshot.parts.PARAMETERS,reference},REPORT:{...row.snapshot.parts.REPORT,payload,hash:canonicalHash(payload),reference}}
    const t:Triplet={...row.snapshot,parts,schemaVersion:1,title:'合成图表报告',references:[],template,blockers:[],reference}
    expect(computeStandardTrial(t,'synthetic-trial').every(result=>result.report?.blocks.some(block=>block.type==='CHART'))).toBe(true)
  })
})
