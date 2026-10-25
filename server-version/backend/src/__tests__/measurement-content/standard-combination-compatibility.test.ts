import {describe,expect,it} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {standardAxisHashes,standardCombinationHash,standardCombinationMeasurementInput} from '../../modules/measurement-content/standard-combination'
import {tripletSnapshot,type Triplet} from '../../modules/survey/standard-triplet.model'
import {toolReference} from '../../modules/survey/tool-reference'
import {combinationFixture} from './standard-combination.fixture'
import golden from './standard-combination-legacy.json'

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
})
