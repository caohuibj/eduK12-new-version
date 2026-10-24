import {describe,it,expect} from 'vitest'
import {trainingAttemptLink,trainingStudyLink} from './training-participation-link'
import {personalParticipationLink,readPersonalParticipationProof} from '../../survey/personal-participation-link'
const id='11111111-1111-4111-8111-111111111111',key='a'.repeat(43)
describe('shared participation links with product-scoped proof',()=>{
 it('keeps a single Training attempt distinct from a long-lived study or Survey proof',()=>{
  const single=new URL(trainingAttemptLink.link('https://training.example',id,{key}))
  expect(single.pathname).toBe(`/public/composite/attempts/${id}`)
  expect(single.search).toBe('');expect(trainingAttemptLink.read(single.hash)).toEqual({key})
  expect(trainingStudyLink.read(single.hash)).toBeNull();expect(readPersonalParticipationProof(single.hash)).toBeNull()
  const study=new URL(trainingStudyLink.link('https://training.example',id,{key}))
  expect(trainingStudyLink.read(study.hash)).toEqual({key});expect(trainingAttemptLink.read(study.hash)).toBeNull()
 })
 it('preserves Survey portable links exactly and never accepts them in Training',()=>{
  const link=personalParticipationLink('https://survey.example',id,{researchCode:'R-12345678',accessCredential:key})
  expect(link).toBe(`https://survey.example/r/${id}#resume=1&code=R-12345678&key=${key}`)
  expect(trainingStudyLink.read(new URL(link).hash)).toBeNull()
 })
 it('rejects duplicate keys, mixed identities, malformed proof and executable origins',()=>{
  expect(trainingStudyLink.read(`#resume=training-study&key=${key}&key=${key}`)).toBeNull()
  expect(trainingStudyLink.read(`#resume=training-study&key=${key}&code=R-12345678`)).toBeNull()
  expect(trainingStudyLink.link('javascript:alert(1)',id,{key})).toBe('')
  expect(trainingStudyLink.link('https://training.example',id,{key:'short'})).toBe('')
 })
})
