import {afterEach,it,expect,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {EducationPackageLibrary} from './EducationPackageLibrary'
import type {PrivateToolApi} from './privateToolClient'
afterEach(cleanup)
it('connects an exact whole package to existing registration while retaining original parameters and report',async()=>{
 const ref={provider:'NATIVE_RELEASE',versionId:'release',contentHash:'a'.repeat(64)},source={sourceCompositeId:'source',title:'原版来源',canPrepare:true,canPublish:false,licenses:[{resourceId:'source',grantId:'grant'}],unavailableReason:null}
 const summary={sourceRef:ref,catalogKey:'exact',title:'整包示例',kind:'PACKAGE_REFERENCE',sourceProvider:'NATIVE_RELEASE',family:'NATIVE_BUNDLE',toolKey:'fixture',contentVersion:'1.0.0',reportVersion:'1.0.0',memberCount:1,population:null,allowedActions:['PREVIEW_WHOLE_PACKAGE','REGISTER_WHOLE_PACKAGE'],canEditOriginal:false,canSplit:false,canMix:false}
 const preview={...summary,readOnly:true,protocol:'NATIVE_BUNDLE_V3',description:'工程合成夹具',members:[],context:null,report:null,limitations:[]}
 const preparation={resourceId:'prepared',title:'整包登记',family:'BUNDLE',sourceCompositeId:'source',preparationHash:'b'.repeat(64),licenses:source.licenses,units:[],publicPackage:ref,
  fixedSelection:{references:{schemaVersion:1,units:[{itemId:'item',choices:[{releaseId:'parameter',entryKey:'original',priority:7}]}]},reports:[{itemId:'item',releaseId:'report'}]}}
 const choices={nextCursor:null,units:[{itemId:'item',family:'SJT',measurement:{releaseId:'measurement',contentHash:'c'.repeat(64)},references:[{releaseId:'parameter',selectable:true,licenses:[{resourceId:'parameter',grantId:'grant'}],choices:[{entryKey:'original',metricKey:'score'}]}],reports:[{releaseId:'report',title:'原单项报告',selectable:true,metricKeys:['score'],licenses:[{resourceId:'report',grantId:'grant'}]}]}]}
 const root='/organizations/school-a/assessment-resource-registrations',base='/organizations/school-a/private-tools/package-sources'
 let preparationId=''
 const api=vi.fn(async(path:string,method?:string,data?:unknown)=>{
  if(path===base)return {list:[summary],nextCursor:null}
  if(path===base+'/preview')return preview
  if(path===root)return {list:[],nextCursor:null}
  if(path.startsWith(root+'/source-candidates?'))return {list:[source],nextCursor:null}
  if(path===root+'/preparations'){preparationId=(data as {resourceId:string}).resourceId;return {...preparation,resourceId:preparationId}}
  if(path.endsWith('/content-choices'))return choices
  if(path.endsWith('/register')||path===root+'/'+preparationId)return {resourceId:'prepared',status:'DRAFT',entryHash:'d'.repeat(64)}
  throw Error('Unexpected request '+method+' '+path)
 })
 const onState=vi.fn()
 render(<EducationPackageLibrary api={api as PrivateToolApi} organizationId="school-a" entry="TEACHER" actorId="author" onDraftStateChange={onState}/>)
 fireEvent.click(await screen.findByRole('button',{name:'查看完整包'}))
 fireEvent.click(await screen.findByRole('button',{name:'引用整包到本校任务'}))
 fireEvent.click(await screen.findByRole('button',{name:'读取登记权限与资源'}))
 fireEvent.click(await screen.findByRole('button',{name:'读取获授权来源'}))
 await screen.findByRole('option',{name:'原版来源 · 可准备'})
 const sourceCall=api.mock.calls.find(call=>call[0].startsWith(root+'/source-candidates?'))!
 expect(JSON.parse(new URLSearchParams(sourceCall[0].split('?')[1]).get('publicPackage')!)).toEqual(ref)
 fireEvent.change(screen.getByLabelText('获授权来源'),{target:{value:'source'}})
 fireEvent.change(screen.getByLabelText('登记标题'),{target:{value:'整包登记'}})
 fireEvent.click(screen.getByRole('button',{name:'准备独立教育版本'}))
 await screen.findByText(/整包的成员、顺序、参数和综合报告保持原版/)
 expect(api).toHaveBeenCalledWith(root+'/preparations','POST',expect.objectContaining({publicPackage:ref,family:'BUNDLE',sourceCompositeId:'source'}))
 expect(screen.getByRole('checkbox')).toBeChecked();expect(screen.getByRole('checkbox')).toBeDisabled()
 expect(screen.getByLabelText('精确报告 R')).toHaveValue('report');expect(screen.getByLabelText('精确报告 R')).toBeDisabled()
 // Dirty preparation does not reset the package or trigger a new catalog read.
 expect(api.mock.calls.filter(call=>call[0]===base)).toHaveLength(1)
 expect(screen.getByRole('button',{name:'搜索'})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('本人披露'),{target:{value:'INDIVIDUAL_SUMMARY'}})
 fireEvent.change(screen.getByLabelText('反馈开放方式'),{target:{value:'IMMEDIATE'}})
 fireEvent.click(screen.getByRole('button',{name:'冻结登记为草稿'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith(root+'/preparations/'+preparationId+'/register','POST',expect.objectContaining(preparation.fixedSelection)))
 expect(onState).toHaveBeenCalledWith({dirty:true,writing:false})
})
