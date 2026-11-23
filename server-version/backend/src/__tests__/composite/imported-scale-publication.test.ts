import {describe,expect,it,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {loadComposite,lockCompositeAssetReferences} from '../../modules/composite/composite.service'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {MIXED_SCALE_DEFINITION} from '../questionnaire/product-fixtures'

const scale={id:'imported-scale',code:'synthetic-import-without-code-package',creatorId:'author',status:'PUBLISHED',name:'Imported fixture',
 instrumentClass:'STANDARD',instrumentVersion:'1.0.0',standardSourceKind:'DB_IMPORTED',definition:MIXED_SCALE_DEFINITION,
 definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION)}
function database(overrides:Record<string,unknown>={}){
 return {compositeAssessment:{findUnique:vi.fn(async({include}:any)=>({id:'questionnaire',personalTracking:null,formSections:[],items:[{
  id:'scale-unit',type:'SCALE',standardCombinationSource:{reference:'fixture-only'},
  scale:Object.fromEntries(Object.keys(include.items.include.scale.select).map(key=>[key,({...scale,...overrides} as Record<string,unknown>)[key]])),
 }]}))},$queryRaw:vi.fn()}
}
describe('imported standard scale publication media prelock',()=>{
 it('retains imported source identity and validated definition hash through the actual Prisma projection',async()=>{
  const db=database(),row=await loadComposite('questionnaire',true,db)
  expect(row.items[0].scale).toMatchObject({standardSourceKind:'DB_IMPORTED',definitionHash:scale.definitionHash})
  await expect(lockCompositeAssetReferences(db,row.items,row.formSections,new Map())).resolves.toEqual([])
  expect(db.$queryRaw).not.toHaveBeenCalled()
 })
 it.each([null,'0'.repeat(64)])('still rejects missing or changed imported definition digest (%s)',async definitionHash=>{
  const db=database({definitionHash}),row=await loadComposite('questionnaire',true,db)
  await expect(lockCompositeAssetReferences(db,row.items,row.formSections,new Map())).rejects.toThrow('数据库标准量表冻结定义摘要不匹配')
 })
})
