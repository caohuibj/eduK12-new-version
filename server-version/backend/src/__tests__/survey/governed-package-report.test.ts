import {afterAll,describe,expect,it} from 'vitest'
import {dryRunSurveyForm,type SurveyComputedFinal} from '../../modules/survey/final.compute'
import {renderPackageReport} from '../../modules/survey/governed-tool.reports'
import type {FormDraft} from '../../modules/survey/builder.definition'
import type {PackageReport} from '../../modules/survey/governed-tool.model'
const form:FormDraft={schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[
 {itemKey:'choice',type:'SINGLE',prompt:'Choice',required:false,allowRefusal:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]},
 {itemKey:'matrix',type:'MATRIX',prompt:'Matrix',required:false,allowRefusal:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[{rowKey:'r1',label:'Row one'},{rowKey:'r2',label:'Row two'}]},
 {itemKey:'hidden',type:'SHORT_TEXT',prompt:'Conditional',required:false,options:[],rows:[],displayIf:{itemKey:'choice',operator:'EQUALS',optionKey:'yes'}},
]}]}
const spec:PackageReport={version:'1',title:'Synthetic',introduction:'',disclaimer:'',blocks:['choice','matrix','hidden'].map(itemKey=>({type:'FORM_FIELD',slotKey:'form',itemKey,label:itemKey}))}
function render(answers:Record<string,unknown>){
 const result={instrumentKey:'form',kind:'FORM' as const,sourceDigest:'synthetic',scoringDigest:null,...dryRunSurveyForm(form,answers),privateScoring:null}
 const calculated:SurveyComputedFinal={schemaVersion:1,definitionDigest:'synthetic',units:[result]}
 return {calculated,report:renderPackageReport(spec,[{slotKey:'form',unit:{ref:{kind:'FORM'},displayDefinition:form}}],calculated,{form:'form'})}
}
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('package report consumes verified missingness without rescoring',()=>{
 it('renders root and matrix-row refusal from normalized missing reasons',()=>{
  const {calculated,report}=render({choice:{_surveyRefusal:true},'matrix:r1':{_surveyRefusal:true},'matrix:r2':'yes'})
  expect(calculated.units[0].rawAnswers).not.toHaveProperty('choice')
  expect(report.blocks).toEqual([{type:'TEXT',text:'choice：明确拒答'},{type:'TEXT',text:'matrix：Row one：明确拒答；Row two：Yes'},{type:'TEXT',text:'hidden：未展示'}])
 })
 it('distinguishes shown omissions, hidden fields and ordinary choice labels',()=>{
  const {report}=render({choice:'no','matrix:r1':'no'})
  expect(report.blocks).toEqual([{type:'TEXT',text:'choice：No'},{type:'TEXT',text:'matrix：Row one：No；Row two：未填写'},{type:'TEXT',text:'hidden：未展示'}])
 })
})
