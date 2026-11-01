import {describe,it,expect} from 'vitest'
import {matrixConfigSchema,matrixConfigV11Schema} from '../../modules/cognitive/schemas/matrix.config'
import {scoreMatrixV1} from '../../modules/cognitive/scoring/matrix.v1'
import {matrixSequence} from '../../modules/cognitive/randomization'
import {seeds} from '../../modules/cognitive/tasks/matrix/seeds'
import {executionEntries} from '../../modules/cognitive/tasks/matrix/package'
import {participantPresentations} from '../../modules/cognitive/tasks/matrix/participant-presentation.v11'
import fixture from '../../modules/cognitive/tasks/matrix/fixtures/1.1.0-1.0.0.json'
describe('matrix practice-only C version',()=>{
 it('keeps legacy config and scorer, freezes new practice, and leaves 6/16/24 formal counts unchanged',()=>{
  const old=seeds.find(s=>s.configVersion==='1.0.0')!,next=seeds.find(s=>s.configVersion==='1.1.0')!
  expect(matrixConfigSchema.parse(old.config)).toEqual(old.config)
  expect(matrixConfigV11Schema.parse(next.config).practiceSetVersion).toBe('matrix-practice-v1.1.0')
  expect(matrixConfigV11Schema.safeParse(old.config).success).toBe(false)
  const entries=executionEntries as any[]
  expect(entries.find(e=>e.engineVersion==='1.1.0').score).toBe(scoreMatrixV1)
  expect(entries.find(e=>e.engineVersion==='1.0.0').score).toBe(scoreMatrixV1)
  expect(participantPresentations.some(p=>p.engineVersion==='1.0.0'&&p.presentationVersion==='1.3.0')).toBe(true)
  expect(participantPresentations.some(p=>p.engineVersion==='1.1.0'&&p.presentationVersion==='1.4.0')).toBe(true)
  for(const n of [6,16,24])expect(matrixSequence('practice-audit-252',n)).toHaveLength(n)
 })
 it('uses the retained golden fixture for the unchanged formal scorer under the new C',()=>{
  for(const sample of fixture.cases){const s=sample as any;if(s.expectedError)expect(()=>scoreMatrixV1(s.input)).toThrow(s.expectedError);else expect(scoreMatrixV1(s.input)).toEqual(s.expected)}
 })
})
