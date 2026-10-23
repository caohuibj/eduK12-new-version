import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {createMemoryRouter,RouterProvider} from 'react-router-dom'
import {emptyDefinition} from '../scaleDefinitionEditorModel'
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}))
vi.mock('../../api/client',()=>({default:api}))
import ScaleEdit from '../ScaleEdit'
afterEach(cleanup)
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({code:0,data:{id:'scale-1',code:'SELF',name:'我的量表',status:'DRAFT',visibility:'HIDDEN',instrumentClass:'CUSTOM_DESCRIPTIVE',definition:emptyDefinition()}})})
describe('scale pending paste route boundary',()=>{
 it('blocks header writes and protects data-router navigation until explicit discard',async()=>{
  const router=createMemoryRouter([{path:'/scales/:id',element:<ScaleEdit/>},{path:'/scales',element:<p>量表目录</p>}],{initialEntries:['/scales/scale-1']})
  render(<RouterProvider router={router}/>)
  fireEvent.click(await screen.findByRole('button',{name:'响应选项'}))
  fireEvent.change(await screen.findByLabelText('选项批量内容'),{target:{value:'尚未应用'}})
  fireEvent.click(screen.getByRole('button',{name:'基本信息'}))
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'响应选项'}))
  expect(screen.getByLabelText('选项批量内容')).toHaveValue('尚未应用')
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'运行发布检查'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'发布自用（描述性量表）'})).toBeDisabled()
  fireEvent.click(screen.getByRole('link',{name:'返回量表列表'}))
  expect(await screen.findByRole('button',{name:'继续编辑'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'继续编辑'}))
  expect(screen.getByLabelText('选项批量内容')).toHaveValue('尚未应用')
  fireEvent.click(screen.getByRole('link',{name:'返回量表列表'}))
  fireEvent.click(await screen.findByRole('button',{name:'放弃修改并离开'}))
  await waitFor(()=>expect(screen.getByText('量表目录')).toBeInTheDocument())
  expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled()
 })
})
