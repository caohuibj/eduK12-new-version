import {describe,expect,it} from 'vitest'
import type {FormDraft} from '../survey/builder.types'
import {lastVisibleHuiteacherFormPageIndex} from './formTaskPagination'

const pages:FormDraft['pages']=[
  {pageKey:'first',title:'先决条件',questions:[
    {itemKey:'first',prompt:'评价入口',type:'SINGLE',required:true,
      options:[{optionKey:'show',label:'继续'},{optionKey:'skip',label:'跳过中间页'}],rows:[]},
  ]},
  {pageKey:'middle',title:'条件分支',questions:[
    {itemKey:'middle',prompt:'仅部分被试显示',type:'LONG_TEXT',
      required:true,options:[],rows:[],
      displayIf:{itemKey:'first',operator:'EQUALS',optionKey:'show'}},
  ]},
  {pageKey:'final',title:'所有人都必须完成的末页',questions:[
    {itemKey:'final',prompt:'后续必答',type:'LIKERT',required:true,rows:[],
      options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}]},
  ]},
]
describe('Huiteacher conditional page FINAL gating',()=>{
  it('matches TaskForm visible-page indices and blocks early FINAL',()=>{
    // first+last visible -> visible index 1, not original index 2.
    const hiddenMiddle=lastVisibleHuiteacherFormPageIndex(pages,{first:'skip'})
    expect(hiddenMiddle).toBe(1)
    expect(0>=hiddenMiddle).toBe(false)
    expect(1>=hiddenMiddle).toBe(true)
    expect(lastVisibleHuiteacherFormPageIndex(pages,{first:'show'})).toBe(2)
  })
  it('permits submission at the final visible page if a trailing page is hidden',()=>{
    const shortened:FormDraft['pages']=[pages[0],{
      ...pages[1],questions:[{...pages[1].questions[0],required:false}],
    }]
    expect(lastVisibleHuiteacherFormPageIndex(shortened,{first:'skip'})).toBe(0)
    expect(lastVisibleHuiteacherFormPageIndex(shortened,{first:'show'})).toBe(1)
  })
})
