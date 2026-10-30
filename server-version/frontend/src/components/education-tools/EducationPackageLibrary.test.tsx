import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPackageLibrary} from './EducationPackageLibrary'
import type {EducationPackageSummary,EducationPackagePreview} from './packageReferenceClient'
import type {PrivateToolApi} from './privateToolClient'
const ref={provider:'NATIVE_RELEASE' as const,versionId:'fixed-package',contentHash:'a'.repeat(64)}
const summary:EducationPackageSummary={sourceRef:ref,catalogKey:'whole-exact-package',title:'原版完整包',kind:'PACKAGE_REFERENCE',sourceProvider:'NATIVE_RELEASE',family:'NATIVE_BUNDLE',
 toolKey:'package-key',contentVersion:'2.0.0',reportVersion:'3.0.0',memberCount:2,population:null,allowedActions:['PREVIEW_WHOLE_PACKAGE'],canEditOriginal:false,canSplit:false,canMix:false}
const preview:EducationPackagePreview={...summary,readOnly:true,protocol:'NATIVE_BUNDLE_V3',description:'原版整体说明',
 members:[{slotKey:'first',kind:'SCALE',position:0,required:true,instrumentKey:'原版量表',instrumentVersion:'2.1.0',respondentType:'SELF'},
  {slotKey:'second',kind:'COGNITIVE',position:1,required:true,instrumentKey:'原版认知',instrumentVersion:'4.0.0',respondentType:'SELF'}],
 engine:{key:'original',version:'1.0.0'},context:null,report:{key:'joint-report',version:'3.0.0',title:'原版整体报告',sections:{summary:'原版联合解释',limitations:'解释范围'}},limitations:['原版适用限制']}
const base='/organizations/school-a/private-tools/package-sources'
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
afterEach(()=>cleanup())
describe('whole package library read-only journey',()=>{
 it('previews the exact whole source and preserves its members/report without editable or mixed-package actions',async()=>{
  const api=vi.fn(async(path:string)=>path===base?{list:[summary],nextCursor:null}:preview)
  render(<EducationPackageLibrary api={api as PrivateToolApi} organizationId="school-a" entry="SCHOOL" actorId="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'查看完整包'}))
  const panel=await screen.findByRole('region',{name:'固定整包只读预览'})
  expect(api).toHaveBeenLastCalledWith(base+'/preview','POST',{sourceRef:ref})
  expect(within(panel).getAllByRole('listitem').slice(0,2).map(item=>item.textContent)).toEqual(['原版量表 · 量表 · 版本 2.1.0','原版认知 · 认知任务 · 版本 4.0.0'])
  expect(within(panel).getByText('原版联合解释')).toBeInTheDocument()
  expect(within(panel).getByText('原版适用限制')).toBeInTheDocument()
  expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(panel).getAllByRole('button').map(button=>button.textContent)).toEqual(['关闭预览'])
 })
 it('keeps failed current-U previews empty and permits an explicit retry without creating anything',async()=>{
  let allowed=false
  const api=vi.fn(async(path:string)=>{
   if(path===base)return {list:[summary],nextCursor:null}
   if(!allowed)throw {code:'EDUCATION_PACKAGE_USE_REQUIRED'}
   return preview
  })
  render(<EducationPackageLibrary api={api as PrivateToolApi} organizationId="school-a" entry="SCHOOL" actorId="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'查看完整包'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('已无该固定整包的使用授权')
  expect(screen.queryByRole('region',{name:'固定整包只读预览'})).not.toBeInTheDocument()
  allowed=true;fireEvent.click(screen.getByRole('button',{name:'查看完整包'}))
  await screen.findByRole('region',{name:'固定整包只读预览'})
  expect(api.mock.calls.map(([path])=>path)).toEqual([base,base+'/preview',base+'/preview'])
 })
 it('shows original required context metadata as read-only content without collecting a preview answer',async()=>{
  const exact={...preview,context:{contextDefinitionVersion:'2.0.0',fields:[{contextKey:'subject_age_years',required:true,valueType:'number'}]}}
  const api=vi.fn(async(path:string)=>path===base?{list:[summary],nextCursor:null}:exact)
  render(<EducationPackageLibrary api={api as PrivateToolApi} organizationId="school-a" entry="SCHOOL" actorId="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'查看完整包'}))
  const context=await screen.findByRole('region',{name:'原包背景信息要求'})
  expect(context).toHaveTextContent('版本 2.0.0')
  expect(context).toHaveTextContent('年龄（周岁） · 必填')
  expect(within(context).queryByRole('spinbutton')).not.toBeInTheDocument()
 })
 it('drops a late preview when the organization changes under the same stable API reference',async()=>{
  const old=deferred<EducationPackagePreview>(),nextBase=base.replace('school-a','school-b')
  const api=vi.fn((path:string)=>path===base+'/preview'?old.promise:Promise.resolve({list:[{...summary,title:path===nextBase?'乙校整包':'甲校整包'}],nextCursor:null}))
  const view=render(<EducationPackageLibrary api={api as PrivateToolApi} organizationId="school-a" entry="SCHOOL" actorId="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'查看完整包'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/preview','POST',{sourceRef:ref}))
  view.rerender(<EducationPackageLibrary api={api as PrivateToolApi} organizationId="school-b" entry="SCHOOL" actorId="author"/>)
  await screen.findByText('乙校整包')
  await act(async()=>{old.resolve(preview);await old.promise})
  expect(screen.queryByRole('region',{name:'固定整包只读预览'})).not.toBeInTheDocument()
  expect(screen.queryByText('甲校整包')).not.toBeInTheDocument()
 })
})
