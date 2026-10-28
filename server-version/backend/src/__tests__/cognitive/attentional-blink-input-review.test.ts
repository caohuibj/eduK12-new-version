import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,expect,it,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {scoreBlink,blinkEnvelope} from '../../modules/cognitive/content-candidates/attentional-blink/scorer'
import {projectBlinkReport} from '../../modules/cognitive/content-candidates/attentional-blink/report'
import type {BlinkRaw} from '../../modules/cognitive/content-candidates/attentional-blink/protocol'

const fixture=JSON.parse(readFileSync(resolve(__dirname,'../../../../../docs/cognitive-library/onboarding-content-20261028/parallel-review/attentional-blink/representative-records.json'),'utf8'))
const input=(raw:BlinkRaw)=>({session:fixture.session,config:fixture.session.config,randomSeed:fixture.randomSeed,trials:[blinkEnvelope(raw)]})
const raw=():BlinkRaw=>structuredClone(fixture.records[0].raw)
describe('blink keyboard action provenance',()=>{
 it('rejects a letter action whose recorded physical letter key names another letter',()=>{
  const changed=raw(),action=changed.actions[0]
  action.key='Key'+(action.letter==='Z'?'Y':'Z')
  expect(()=>scoreBlink(input(changed))).toThrow('keyboard')
 })
 it('rejects a confirm action labelled as Backspace',()=>{
  const changed=raw();changed.actions[changed.actions.length-1].key='Backspace'
  expect(()=>scoreBlink(input(changed))).toThrow('keyboard')
 })
 it('retains direct letters and focused Space/Enter/NumpadEnter activation without changing outcomes',()=>{
  const baseline=projectBlinkReport(scoreBlink(input(raw())))
  for(const key of ['Space',' ','Enter','NumpadEnter']){
   const changed=raw();changed.actions[0].key=key
   expect(projectBlinkReport(scoreBlink(input(changed)))).toEqual(baseline)
  }
  const fallback=raw();fallback.actions[0].key=fallback.actions[0].letter!.toLowerCase()
  expect(projectBlinkReport(scoreBlink(input(fallback)))).toEqual(baseline)
 })
})
