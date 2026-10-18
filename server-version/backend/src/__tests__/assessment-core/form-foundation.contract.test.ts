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
    for(const file of walk(root).filter(f=>f.endsWith('.ts'))){
      const source=fs.readFileSync(file,'utf8')
      const imports=[...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m=>m[2])
      const scaleImportDependencies=path.relative(root,file)==='scale/import-parser.ts' ? new Set(['../form/import-parser','../../scale/scale-definition']) : new Set<string>()
      for(const specifier of imports)expect(allowed.has(specifier)||scaleImportDependencies.has(specifier),`${path.relative(root,file)} -> ${specifier}`).toBe(true)
    }
  })
})
