import {describe,it,expect,vi} from 'vitest'
import {sealPrivateFormRuntimeForPublication} from '../../modules/education-tools/private-tool.form-runtime-resources'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const input={key:`private-form:SCHOOL:${id(1)}:STUDENT:SELF`,compositeId:id(2)}
function db(status:string,publishedAt:Date|null){return {$queryRaw:vi.fn().mockResolvedValue([{status,publishedAt}]),compositeAssessment:{update:vi.fn().mockResolvedValue({})}}}
describe('Private FORM native publication write after authorized Run validation',()=>{
 it('locks the exact identity and changes only status and first publication timestamp',async()=>{
  const tx=db('DRAFT',null);await sealPrivateFormRuntimeForPublication(tx as any,input)
  expect(tx.$queryRaw).toHaveBeenCalledOnce()
  const query=tx.$queryRaw.mock.calls[0][0]
  expect(query.values).toEqual([input.compositeId,input.key]);expect(query.sql).toContain('FOR UPDATE')
  expect(tx.compositeAssessment.update).toHaveBeenCalledWith({where:{id:input.compositeId},data:{status:'PUBLISHED',publishedAt:expect.any(Date)}})
 })
 it('reuses an already published fixed parent without rewriting timestamp/content',async()=>{
  const tx=db('PUBLISHED',new Date());await sealPrivateFormRuntimeForPublication(tx as any,input)
  expect(tx.compositeAssessment.update).not.toHaveBeenCalled()
 })
 it('refuses invalid lifecycle and namespace without updating content',async()=>{
  for(const [status,date] of [['DRAFT',new Date()],['PUBLISHED',null],['ARCHIVED',new Date()]] as const){
   const tx=db(status,date);await expect(sealPrivateFormRuntimeForPublication(tx as any,input)).rejects.toThrow('PRIVATE_FORM_RUNTIME_COMPOSITE_INVALID');expect(tx.compositeAssessment.update).not.toHaveBeenCalled()
  }
  const tx=db('DRAFT',null);await expect(sealPrivateFormRuntimeForPublication(tx as any,{...input,key:'teacher-form:'+id(1)})).rejects.toThrow();expect(tx.$queryRaw).not.toHaveBeenCalled()
 })
})
