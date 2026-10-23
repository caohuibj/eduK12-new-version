import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {beforeEach,describe,expect,it,vi} from 'vitest'

const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}))
vi.mock('../../../api/client',()=>({default:api}))
vi.mock('../../../training/context',()=>({isTrainingHost:()=>true}))
vi.mock('../../../contexts/CapabilitiesContext',()=>({useCognitiveEnabled:()=>true}))
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'teacher',role:'TEACHER'}})}))
import {QuestionnaireProductEdit} from '../QuestionnaireProducts'

const empty={id:'form',productKind:'FORM_TEMPLATE',name:'批量录入测试',status:'DRAFT',questionnaireType:'GENERAL',revision:2,publicEnabled:false,items:[],formSections:[],questionnaireCourses:[]}
beforeEach(()=>{
  vi.resetAllMocks();sessionStorage.clear()
  api.get.mockResolvedValue({code:0,data:empty})
  api.post.mockResolvedValue({code:0,data:{...empty,revision:3}})
})

describe('Training uses the shared Form bulk panel in its existing save flow',()=>{
  it.each(['single_choice','multiple_choice','likert','matrix','matrix_multiple'])('bulk authors %s and keeps the current revision contract',async type=>{
    render(<MemoryRouter initialEntries={['/toolkit/forms/form']}><Routes><Route path="/toolkit/forms/:id" element={<QuestionnaireProductEdit formTemplate/>}/></Routes></MemoryRouter>)
    await screen.findByRole('button',{name:'添加题目'})
    fireEvent.change(screen.getByLabelText('题型'),{target:{value:type}})
    fireEvent.change(screen.getByLabelText('题目文字'),{target:{value:'批量录入题'}})
    fireEvent.click(screen.getByRole('button',{name:'批量粘贴选项'}))
    const options=screen.getByRole('region',{name:'批量粘贴选项'})
    fireEvent.change(within(options).getByLabelText('选项批量内容'),{target:{value:'不同意\r\n一般\n同意'}})
    expect(within(options).getAllByRole('listitem')).toHaveLength(3)
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(within(options).getByRole('button',{name:'应用 3 项'}))
    if(type.startsWith('matrix')){
      fireEvent.click(screen.getByRole('button',{name:'批量粘贴矩阵行'}))
      const rows=screen.getByRole('region',{name:'批量粘贴矩阵行'})
      fireEvent.change(within(rows).getByLabelText('矩阵行批量内容'),{target:{value:'我能专注\n我能计划'}})
      fireEvent.click(within(rows).getByRole('button',{name:'应用 2 项'}))
    }
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'添加题目'}))
    await waitFor(()=>expect(api.post).toHaveBeenCalledOnce())
    expect(api.post.mock.calls[0][0]).toBe('/questionnaire-products/form/items')
    const payload=api.post.mock.calls[0][1]
    expect(payload.revision).toBe(2)
    expect(payload.item).toMatchObject({type:'FORM',formType:type,formLabel:'批量录入题'})
    const savedOptions=payload.item.formDefinition?.options??payload.item.formOptions
    expect(savedOptions.map((option:{label:string})=>option.label)).toEqual(['不同意','一般','同意'])
    if(type.startsWith('matrix'))expect(payload.item.formDefinition.rows.map((row:{label:string})=>row.label)).toEqual(['我能专注','我能计划'])
  })
})
