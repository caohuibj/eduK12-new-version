/** Pure regression for the teacher section projection: section fields have no
 * native item type. Executes the actual fixture declarations without importing
 * its HTTP/database transport or creating connections. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {createRequire} from 'node:module'
const backend=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const source=fs.readFileSync(new URL('./c19-flow-fixture.mjs',import.meta.url),'utf8').replace(/^import .*$/mg,'').replace(/^export /mg,'')
const context={require,path,backend,assert,Date};vm.createContext(context)
vm.runInContext(source+'\nthis.contract={formRows,mainConfig,form};',context)
const fields=['route','multiple','likert'].map((label,index)=>({id:'form-'+index,...context.contract.form(label,['SINGLE','MULTIPLE','LIKERT'][index]),formDefinition:{...context.contract.form(label,['SINGLE','MULTIPLE','LIKERT'][index]).formDefinition,itemKey:'answer_'+index}}))
const projected=fields.map(({type,...field})=>field)
const product={formSections:[{id:'section-a',items:projected}],items:[...fields,...['SCALE','COGNITIVE','SITUATIONAL'].map(type=>({id:type.toLowerCase(),type}))]}
const rows=context.contract.formRows(product);assert.ok(rows.every(row=>row.type==='FORM'&&row.formSectionId==='section-a'))
const config=context.contract.mainConfig(product)
const {compileTrainingFlow}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
const units=[{instrumentKey:'section_section_a',kind:'FORM',required:true,definitionHash:'a'.repeat(64),displayDefinition:{pages:[{questions:fields.map(field=>field.formDefinition)}]}},...product.items.filter(item=>item.type!=='FORM').map(item=>({instrumentKey:'item_'+item.id,kind:item.type==='SITUATIONAL'?'SJT':item.type,required:true,definitionHash:'b'.repeat(64)}))]
const frozen=compileTrainingFlow(JSON.parse(JSON.stringify(config)),units)
assert.equal(frozen.blocks[1].instrumentKey,'section_section_a')
assert.equal(frozen.blocks[5].when.terms.length,3)
console.log('PASS real Form projection maps section identity; all three typed sources compile with unchanged production compiler')
