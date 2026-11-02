import {afterEach,expect,it,vi} from 'vitest'
import {act,render,screen,waitFor} from '@testing-library/react'
import SchoolApp from './SchoolApp'

const originalScroll=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView')
afterEach(()=>{
  if(originalScroll)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',originalScroll)
  else Reflect.deleteProperty(HTMLElement.prototype,'scrollIntoView')
  vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')
})

it('locates the feature cards after a guide return finishes loading the public homepage',async()=>{
  window.history.replaceState(null,'','/#hs-features')
  let finish!:()=>void
  vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{finish=()=>resolve({ok:false,status:401,json:async()=>({code:-1})})})))
  vi.stubGlobal('scrollTo',vi.fn())
  const scroll=vi.fn()
  Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scroll})
  render(<SchoolApp/>)
  expect(scroll).not.toHaveBeenCalled()
  await act(async()=>{finish()})
  const cards=await screen.findByRole('region',{name:'校园成长支持'})
  await waitFor(()=>expect(cards).toHaveFocus())
  expect(scroll).toHaveBeenCalledWith({behavior:'instant',block:'start'})
})
