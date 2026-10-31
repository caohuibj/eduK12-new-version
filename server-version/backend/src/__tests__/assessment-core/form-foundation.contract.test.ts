import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as builder from '../../modules/survey/builder.definition'
import * as final from '../../modules/survey/final.compute'
import * as bulk from '../../modules/survey/builder.import'
import * as publication from '../../modules/survey/publication.service'
import { formDraftSchema, validateFormDefinition } from '../../modules/assessment-core/form/definition'
import { FormAnswerValidationError, parseAnswerMap } from '../../modules/assessment-core/form/answers'
import { normalizeFormAnswers } from '../../modules/assessment-core/form/runtime'
import cases from './fixtures/form-foundation-cases.json'
import golden from './fixtures/form-foundation-golden.json'
import { evaluateFormCase } from './form-foundation-corpus'

const api={builder,final,bulk,publication}
describe('shared Form foundation immutable baseline oracle',()=>{
  it.each(cases.map((c,index)=>[c.name,c,index] as const))('%s',async(_name,test,index)=>{
    expect(golden.baselineCommit).toBe('aeb5ce0111d28f878d733aff73c6e60e85d4bdbf')
    expect(test.name).toBe(golden.cases[index].name)
    // Compare serialized bytes too: error order, missing order, raw choice order and hashes matter.
    expect(JSON.stringify(await evaluateFormCase(test,api))).toBe(JSON.stringify(golden.cases[index].output))
  })
  it('preserves missing, null, NaN and integer diagnostics without accepting invalid input',()=>{
    const source=cases.find(c=>c.name==='v2-all-13-types')!.definition
    const diagnose=(key:string,value:unknown)=>{
      const definition=structuredClone(source) as any
      definition.pages[0].questions[0][key]=value
      return validateFormDefinition(definition).issues
    }
    expect(diagnose('required',undefined)[0].message).toBe('Required')
    expect(diagnose('required',null)[0].message).toBe('Expected boolean, received null')
    expect(diagnose('minSelections',NaN)[0].message).toBe('Expected number, received nan')
    expect(diagnose('minSelections',1.5)[0].message).toBe('Expected integer, received float')
    expect(diagnose('minSelections',31)[0].message).toBe('Number must be less than or equal to 30')
    expect(diagnose('step',0)[0].message).toBe('Number must be greater than 0')
  })
  it('preserves multiple issue paths and unknown-key order while still rejecting them',()=>{
    const definition=structuredClone(cases.find(c=>c.name==='v2-all-13-types')!.definition) as any
    const question=definition.pages[0].questions[0]
    question.required=null
    question.extraFirst=true
    question.extraSecond=true
    expect(validateFormDefinition(definition).issues).toEqual([
      {path:'pages.0.questions.0.required',message:'Expected boolean, received null',severity:'error'},
      {path:'pages.0.questions.0',message:"Unrecognized key(s) in object: 'extraFirst', 'extraSecond'",severity:'error'},
    ])
  })
  it('keeps the legacy schema and exception exports as the same objects',()=>{
    expect(builder.formDraftSchema).toBe(formDraftSchema)
    expect(final.SurveyFinalValidationError).toBe(FormAnswerValidationError)
    try{parseAnswerMap([], 'answers')}catch(error){expect(error).toBeInstanceOf(final.SurveyFinalValidationError)}
  })
  it('uses one definition parse for strict preview and one for frozen answer validation',()=>{
    const fixture=cases.find(c=>c.name==='v2-all-13-types')!
    const parse=vi.spyOn(formDraftSchema,'safeParse')
    try{
      final.dryRunSurveyForm(fixture.definition,fixture.answers)
      expect(parse).toHaveBeenCalledTimes(1)
      parse.mockClear()
      final.validateSurveyUnitAnswers({kind:'FORM',instrumentKey:'form',sourceDigest:'frozen',displayDefinition:fixture.definition} as never,fixture.answers)
      expect(parse).toHaveBeenCalledTimes(1)
    }finally{parse.mockRestore()}
  })
  it('lets a non-Survey adapter consume the exact validator and answer engine',()=>{
    const fixture=cases.find(c=>c.name==='v2-all-13-types')!
    const validation=validateFormDefinition(fixture.definition,{forPreview:true})
    expect(validation.issues).toEqual([])
    expect(normalizeFormAnswers(validation.definition!,parseAnswerMap(fixture.answers,'answers')))
      .toEqual(final.dryRunSurveyForm(fixture.definition,fixture.answers))
    expect(validateFormDefinition(fixture.definition,{forPreview:true}))
      .toEqual(builder.validateSurveyDraft('FORM',fixture.definition,true))
  })
  it('keeps all shared runtime imports away from entry adapters, database and HTTP',()=>{
    const root=path.resolve('src/modules/assessment-core')
    const walk=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)])
    const allowed=new Set(['zod','../assessment-media/assessment-image','../../assessment-runtime/canonical','../definition-primitives','./definition','./answers'])
    // Keep new shared pure modules explicit; no adapter/database/HTTP directory allowances.
    const moduleDependencies:Record<string,readonly string[]>={
      'form/import-builder.ts':['./import-parser'],
      'form/definition.ts':['../../assessment-media/material'],
      'flow/training.ts':['../materials/definition','./compiler'],
      'materials/definition.ts':['../flow/compiler','../flow/definition'],
      'scale/import-parser.ts':['../form/import-parser','../../scale/scale-definition'],
      'sjt/compiler.ts':['../../situational/situation-branching','./selection','./structure'],
      'sjt/runtime.ts':['../../situational/situation-branching','../../situational/situation-scoring',
        '../../situational/situation-model-resolver','../../situational/situation-runtime-definition','./selection','./structure'],
      'sjt/structure.ts':['./selection'],
      'sjt/validation.ts':['./selection'],
      'weighted-variants.ts':['node:crypto','../assessment-runtime/canonical','./definition-primitives'],
    }
    // Check the exact external pure leaf, not a broad media-directory exemption.
    const material=fs.readFileSync(path.resolve(root,'../assessment-media/material.ts'),'utf8')
    const materialImports=[...material.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m=>m[2])
    expect(materialImports).toEqual(['zod'])
    for(const file of walk(root).filter(f=>f.endsWith('.ts'))){
      const source=fs.readFileSync(file,'utf8')
      const imports=[...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m=>m[2])
      const pureModuleDependencies=new Set(moduleDependencies[path.relative(root,file)]??[])
      for(const specifier of imports)expect(allowed.has(specifier)||pureModuleDependencies.has(specifier),`${path.relative(root,file)} -> ${specifier}`).toBe(true)
    }
  })
})
