import {expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../modules/bundle-product/instance',()=>({readInstance:m.read}))
import {trainingGroupLeafItems} from '../../modules/training-analysis/group-source'
it('uses native frozen leaf bindings while keeping mandatory Context and Profile outside group metrics',()=>{
 const items=[{id:'age',type:'FORM'},{id:'scale',type:'SCALE'},{id:'cog',type:'COGNITIVE'},{id:'sjt',type:'SITUATIONAL'}]
 const bindings={schemaVersion:1,slots:[{slotKey:'s',itemId:'scale',unitType:'SCALE'},{slotKey:'c',itemId:'cog',unitType:'COGNITIVE'},{slotKey:'j',itemId:'sjt',unitType:'SITUATIONAL'}],context:[{contextKey:'age',itemId:'age',valueType:'number'}]}
 m.read.mockReturnValue({frozen:{bundleSnapshot:{slotBindings:bindings.slots}},bindings})
 const task={productKind:'ASSESSMENT_BUNDLE',items,bundleInstance:{} as never}
 expect(trainingGroupLeafItems(task).map(item=>item.id)).toEqual(['scale','cog','sjt'])
 expect(task.items).toHaveLength(4)
 m.read.mockReturnValue({frozen:{bundleSnapshot:{slotBindings:bindings.slots}},bindings:{...bindings,slots:[{slotKey:'s',itemId:'age',unitType:'SCALE'}]}})
 expect(()=>trainingGroupLeafItems(task)).toThrow('固定 Bundle 叶工具与冻结来源不一致')
})
