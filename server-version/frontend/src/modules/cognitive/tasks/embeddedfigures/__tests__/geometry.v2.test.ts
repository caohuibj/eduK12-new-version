import {describe,it,expect} from 'vitest'
import {embeddedfiguresItemV2,embeddedTargetTranslations} from '../generator.v2'
import {embeddedfiguresItemV2 as serverItem} from '../../../../../../../backend/src/modules/cognitive/tasks/embeddedfigures/generator.v2'

describe('embeddedfigures1.1 rendered geometry',()=>{
 it('has exactly one translated target in extended line contexts for both profile ranges, with no family/slot shortcut',()=>{
  const slots=new Set<string>()
  for(const seed of ['a','b','c','d','research','experience','phone','desktop'])for(let i=0;i<16;i++){
   const item=embeddedfiguresItemV2(seed,i);slots.add(item.targetId)
   expect(serverItem(seed,i)).toEqual(item)
   expect(item.field.map(f=>embeddedTargetTranslations(f,item.target).length)).toEqual(item.field.map(f=>f.id===item.targetId?1:0))
   expect(item.field.every(f=>f.lines.length===7)).toBe(true)
   expect((Math.min(...item.target.map(p=>p.x))+Math.max(...item.target.map(p=>p.x)))/2).toBe(50)
   expect((Math.min(...item.target.map(p=>p.y))+Math.max(...item.target.map(p=>p.y)))/2).toBe(50)
   for(const f of item.field)for(const s of f.lines)for(const p of [s.a,s.b]){expect(p.x).toBeGreaterThanOrEqual(8-1e-6);expect(p.x).toBeLessThanOrEqual(92+1e-6);expect(p.y).toBeGreaterThanOrEqual(8-1e-6);expect(p.y).toBeLessThanOrEqual(92+1e-6)}
  }
  expect(slots.size).toBe(7)
 })
 it('uses a distinct practice sequence and detects real geometry rather than a target flag',()=>{
  const item=embeddedfiguresItemV2('seed',0)
  expect(embeddedfiguresItemV2('seed:practice',0)).not.toEqual(item)
  const matching=item.field.find(f=>f.id===item.targetId)!
  expect(embeddedTargetTranslations({...matching,id:'a-distractor-label'},item.target)).toHaveLength(1)
  expect(()=>embeddedfiguresItemV2('seed',-1)).toThrow()
 })
})
