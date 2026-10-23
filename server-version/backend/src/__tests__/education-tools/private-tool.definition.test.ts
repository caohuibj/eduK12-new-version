import {describe,it,expect} from 'vitest'
import {initialPrivateToolDefinition,privateToolDefinition,validatePrivateToolDefinition,privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
import {createPrivateToolInput,updatePrivateToolInput,freezePrivateToolInput} from '../../modules/education-tools/private-tool.contracts'
describe('Education private draft contracts',()=>{
 it('keeps incomplete native drafts editable but not freeze-ready',()=>{
  for(const kind of ['SCALE','FORM'] as const){
   const initial=initialPrivateToolDefinition(kind)
   expect(privateToolDefinition(kind,initial)).toEqual(initial)
   expect(validatePrivateToolDefinition(kind,initial).valid).toBe(false)
  }
 })
 it('rejects author, entry, organization, visibility and unsupported tool kind input',()=>{
  for(const field of ['ownerUserId','entry','organizationId','visibility'])expect(createPrivateToolInput.safeParse({kind:'FORM',title:'T',[field]:'evil'}).success).toBe(false)
  expect(createPrivateToolInput.safeParse({kind:'SJT',title:'T'}).success).toBe(false)
  expect(updatePrivateToolInput.safeParse({expectedRevision:0,title:'T',definition:{}}).success).toBe(false)
  expect(freezePrivateToolInput.safeParse({expectedRevision:1}).success).toBe(false)
 })
 it('pins title and accepts only native image shape, leaving scope checks to the transactional service',()=>{
  const definition=initialPrivateToolDefinition('FORM')
  expect(privateToolContentHash('FORM','A',definition)).not.toBe(privateToolContentHash('FORM','B',definition))
  const media={schemaVersion:2,pages:[{pageKey:'p',title:'T',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'P',required:false,options:[],rows:[],image:{asset:{assetId:'00000000-0000-4000-8000-000000000001',contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'Synthetic'}}]}]}
  expect(privateToolDefinition('FORM',media)).toMatchObject(media)
  expect(validatePrivateToolDefinition('FORM',media).valid).toBe(false) // missing rights
  expect(()=>privateToolDefinition('FORM',{...media,extra:{assetId:'00000000-0000-4000-8000-000000000001'}})).toThrow()
 })
})
