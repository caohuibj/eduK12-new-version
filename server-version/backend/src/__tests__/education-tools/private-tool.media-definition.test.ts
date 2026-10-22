import {describe,it,expect} from 'vitest'
import {privateToolImageReferences} from '../../modules/education-tools/private-tool.media-definition'
import {createCustomScaleDefinition} from '../../modules/scale/scale-definition'
const ref=(id:string)=>({assetId:id,contentHash:'a'.repeat(64),mimeType:'image/png' as const})
describe('Education private image boundary',()=>{
 it('keeps report images out of stimuli while retaining their union',()=>{
  const definition=createCustomScaleDefinition(),a=ref('00000000-0000-4000-8000-000000000001'),b=ref('00000000-0000-4000-8000-000000000002')
  definition.items=[{itemCode:'q',content:'Synthetic',type:'single',required:true,sortOrder:0,responseSetKey:'r',randomizeOptions:false,images:[{asset:a,altText:'Question',order:0}]}]
  definition.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'r',min:0,max:1,includeMax:true,text:'Synthetic',images:[{asset:b,altText:'Report',order:0}]}]}]}
  expect(privateToolImageReferences('SCALE',definition)).toEqual({stimuli:[a],reports:[b],all:[a,b]})
 })
 it('fails closed for video until the education video adapter exists',()=>{
  const definition=createCustomScaleDefinition()
  definition.items=[{itemCode:'q',content:'Synthetic',type:'single',required:true,sortOrder:0,responseSetKey:'r',randomizeOptions:false,video:{schemaVersion:1,video:{...ref('00000000-0000-4000-8000-000000000001'),mimeType:'video/mp4'}}}]
  expect(()=>privateToolImageReferences('SCALE',definition)).toThrow('VIDEO_NOT_READY')
 })
 it('rejects conflicting identities and bounds the number of assets',()=>{
  const form=(refs:ReturnType<typeof ref>[])=>({pages:[{questions:refs.map(asset=>({image:{asset}}))}]})
  const a=ref('00000000-0000-4000-8000-000000000001')
  expect(()=>privateToolImageReferences('FORM',form([a,{...a,contentHash:'b'.repeat(64)}]))).toThrow('IDENTITY_CONFLICT')
  expect(()=>privateToolImageReferences('FORM',form(Array.from({length:31},(_,i)=>ref(String(i)))))).toThrow('MEDIA_LIMIT')
 })
})
