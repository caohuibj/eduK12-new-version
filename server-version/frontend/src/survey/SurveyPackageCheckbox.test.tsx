import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import SurveyApp from './SurveyApp'
const reply=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,data})} as Response)
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
it('premerge: the actual workspace legacy checkbox removes and reselects the complete imported instance',async()=>{
 window.history.replaceState(null,'','/workspace?project=p1&section=publish')
 const project={id:'p1',title:'Synthetic checkbox study',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1}
 const bindings=['a','b'].map(id=>({draftId:id,slotKey:id,instrumentKey:id}))
 const membership={id:'instance',title:'Fixed package',family:'BUNDLE',hash:'a'.repeat(64),status:'ACTIVE',version:1,expiresAt:null,bindings,availability:{ready:true,reasons:[],requiresFreshCheck:true}}
 const tools=['a','b','c'].map(id=>({id,projectId:'p1',instrumentKey:id,kind:'FORM',title:'Tool '+id,status:'DRAFT',revision:1,definition:{schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[]}]}}))
 const material={blockKey:'material',kind:'MATERIAL',title:'Synthetic',body:'Preserve this legal material'}
 const flow={schemaVersion:1,embeddedData:[{key:'keep',type:'STRING',source:'STATIC',value:'keep'}],blocks:[...tools.map(t=>({blockKey:'block_'+t.id,kind:'INSTRUMENT',instrumentKey:t.instrumentKey})),material]}
 const wave={id:'w',projectId:'p1',title:'Checkbox study',ordinal:1,status:'DRAFT',revision:1,instrumentIds:['a','b','c'],publicationId:null,consentText:'Synthetic isolated consent without any human responses.',generalText:'Synthetic',consentVersion:1,linkageNoticeConfirmed:false,opensAt:null,closesAt:null,finishUntil:null,quotaStarts:9,startsCount:0,allowNewParticipants:true,hardStopAt:null,flowDefinition:flow}
 let saved:any
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input)
  if(path.endsWith('/auth/me'))return reply({id:'researcher',username:'Synthetic',mustChangePassword:false})
  if(path.endsWith('/auth/capabilities'))return reply({analytics:false,publication:true})
  if(path.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
  if(path==='/api/survey/projects?page=1')return reply({list:[project]})
  if(path==='/api/survey/projects/p1')return reply(project)
  if(path.includes('/waves?page='))return reply({list:[wave]})
  if(path.includes('/instruments?page='))return reply({list:tools})
  if(path.includes('/package-memberships?')){const ids=new URL(path,'https://synthetic.invalid').searchParams.get('draftIds')?.split(',')??[];return reply({list:ids.some(id=>['a','b'].includes(id))?[membership]:[]})}
  if(path.endsWith('/waves/w')){if(init?.method&&init.method!=='GET'){saved=JSON.parse(String(init.body));return reply({...wave,...saved,revision:2})}return reply(wave)}
  const tool=tools.find(t=>path.endsWith('/instruments/'+t.id));if(tool)return reply(tool)
  throw Error('Unexpected checkbox request '+path)
 })
 vi.stubGlobal('fetch',fetcher);render(<SurveyApp/>)
 fireEvent.click(await screen.findByRole('button',{name:/T1 · Checkbox study/}))
 fireEvent.click(await screen.findByText('选用本研究已加入的工具'))
 const picker=within(screen.getByText('本波次使用的研究工具').closest('fieldset')!)
 const first=()=>picker.getByRole('checkbox',{name:/FORM · Tool a/})
 const second=()=>picker.getByRole('checkbox',{name:/FORM · Tool b/})
 await waitFor(()=>expect(first()).toBeEnabled())
 fireEvent.click(first())
 await waitFor(()=>expect(second()).not.toBeChecked())
 expect(picker.getByRole('checkbox',{name:/FORM · Tool c/})).toBeChecked()
 await waitFor(()=>expect(first()).toBeEnabled());fireEvent.click(first())
 await waitFor(()=>expect(second()).toBeChecked())
 await waitFor(()=>expect(second()).toBeEnabled());fireEvent.click(second())
 await waitFor(()=>expect(first()).not.toBeChecked())
 fireEvent.click(screen.getByRole('button',{name:'保存波次草稿'}))
 await waitFor(()=>expect(saved?.instrumentIds).toEqual(['c']))
 expect(saved.flowDefinition.blocks.map((b:any)=>b.instrumentKey??b.kind)).toEqual(['c','MATERIAL'])
 expect(saved.flowDefinition.blocks[1]).toEqual(material);expect(saved.quotaStarts).toBe(9)
 expect(saved.flowDefinition.embeddedData).toEqual(flow.embeddedData);expect(saved.quotaStarts).toBe(9)
})
