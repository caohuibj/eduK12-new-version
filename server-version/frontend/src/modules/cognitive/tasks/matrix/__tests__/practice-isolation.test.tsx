import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import {MatrixTask} from '../MatrixTask'
import {MATRIX_PRACTICE_V11 as practice,MATRIX_PRACTICE_SET_V11} from '../practice-v1.1'
import {matrixSequence} from '../../shared/prng'
afterEach(cleanup)
const seed='practice-audit-252'
it('reproduces prior answer exposure and isolates all new practice panels with unique taught rules',()=>{
 const old=matrixSequence('matrix-practice-v1',6).slice(0,4),formal=matrixSequence(seed,6)
 expect(formal.filter(f=>old.some(p=>JSON.stringify(p.panels)===JSON.stringify(f.panels)&&p.options[p.correctOption]===f.options[f.correctOption]))).toHaveLength(5)
 expect(formal[0].panels).toEqual(old[0].panels)
 const bank=matrixSequence(seed,24),wrap=(n:number)=>((n-1)%8+8)%8+1
 for(const p of practice){
  expect(bank.some(f=>JSON.stringify(f.panels)===JSON.stringify(p.panels))).toBe(false)
  expect(bank.some(f=>f.itemId===p.itemId)).toBe(false)
  const rows=[p.panels.slice(0,3),p.panels.slice(3,6)],step=wrap(rows[0][1]-rows[0][0])
  const rules=[rows.every(r=>wrap(r[1]-r[0])===step&&r[2]===wrap(r[1]+step))&&'progression',rows.every(r=>r[0]===r[2])&&'alternation',rows.every(r=>r[2]===wrap(r[0]+r[1]))&&'combination'].filter(Boolean)
  expect(rules).toEqual([p.ruleFamily])
  const answer=p.ruleFamily==='progression'?wrap(p.panels[7]+step):p.ruleFamily==='alternation'?p.panels[6]:wrap(p.panels[6]+p.panels[7])
  expect(p.options.filter(x=>x===answer)).toHaveLength(1);expect(p.options[p.correctOption]).toBe(answer)
 }
})
it.each([false,true])('keeps old practice or uses independent new practice without emitting practice data (new=%s)',async revised=>{
 const emit=vi.fn().mockResolvedValue(true),config={itemCount:6,itemTimeoutMs:30000,...(revised?{practiceSetVersion:MATRIX_PRACTICE_SET_V11}:{})}
 render(<MatrixTask taskContext={{sessionId:'test',testType:'matrix',engineVersion:revised?'1.1.0':'1.0.0',scoringVersion:'1.0.0',configVersion:revised?'1.1.0':'1.0.0',attemptNo:1,config,randomSeed:seed}} trialIndex={0} onTrialComplete={emit}/> )
 fireEvent.click(screen.getByText('开始练习'))
 const items=revised?practice:matrixSequence('matrix-practice-v1',6).slice(0,4)
 for(const p of items)fireEvent.click(screen.getByRole('button',{name:`选项 ${p.correctOption+1}`}))
 expect(emit).not.toHaveBeenCalled();fireEvent.click(screen.getByText('开始正式测验'))
 const formal=matrixSequence(seed,6)[0]
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:`选项 ${formal.correctOption+1}`})))
 expect(emit).toHaveBeenCalledTimes(1);expect(emit.mock.calls[0][0].itemId).toBe(formal.itemId)
})
