import {render,screen,fireEvent} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {EducationPublicFormChooser} from './EducationPublicFormChooser'
const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64)
const pin={authorizationId:id,authorizationRevision:1,bindingHash:'b'.repeat(64),configurationHash:'c'.repeat(64)}
describe('Education exact cognitive consumer selection',()=>{
 it('adds the administrator fixed profile and original pointer without offering a technical profile selector',async()=>{
  const choice={catalogKey:'fixed',kind:'COGNITIVE',sourceProvider:'COGNITIVE_CONFIG',sourceId:id,contentHash:hash,artifactHash:'d'.repeat(64),profile:'research',title:'固定反应任务',configurationName:'课堂科研配置',selectedBinding:pin,versions:{content:'1.1.0',parameters:null,report:'1.0.0',profile:'research'},allowedActions:['REFERENCE_FIXED_VERSION'],canEditOriginal:false,canDistribute:false},onChoose=vi.fn(),api=vi.fn(async()=>({list:[choice],nextCursor:null}))
  render(<EducationPublicFormChooser kind="COGNITIVE" api={api as any} entry="SCHOOL" organizationId={id} actorId={id} disabled={false} onChoose={onChoose}/>)
  fireEvent.click(await screen.findByRole('button',{name:'加入认知任务'}));expect(onChoose).toHaveBeenCalledWith(choice);expect(screen.queryByRole('combobox',{name:/任务版本/})).toBeNull()
  expect(screen.getByText(/课堂科研配置/)).toBeInTheDocument()
 })
})
