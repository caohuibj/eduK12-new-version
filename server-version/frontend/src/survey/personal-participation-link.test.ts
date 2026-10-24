import {describe,it,expect} from 'vitest'
import {personalParticipationLink,readPersonalParticipationProof} from './personal-participation-link'
const id='11111111-1111-4111-8111-111111111111'
const proof={researchCode:'R-ABCDEFGH',accessCredential:'a'.repeat(43)}
describe('participant-held personal link',()=>{
  it('round trips proof in the fragment and never in the path or query',()=>{
    const url=new URL(personalParticipationLink('https://survey.example',id,proof))
    expect(url.pathname).toBe('/r/'+id);expect(url.search).toBe('')
    expect(readPersonalParticipationProof(url.hash)).toEqual(proof)
  })
  it.each(['#resume=1&code=R-ABCDEFGH&key=short',
    '#resume=2&code=R-ABCDEFGH&key='+proof.accessCredential,
    '#resume=1&code=R-ABCDEFGH&key='+proof.accessCredential+'&key='+proof.accessCredential,
    '#resume=1&code=R-ABCDEFGH&key='+proof.accessCredential+'&entry='+proof.accessCredential,
    '#resume=1&code=R-ABCDEFGH&key='+proof.accessCredential+'&redirect=https://elsewhere.example',
    '#entry='+proof.accessCredential,
    '#resume=1&code=R-ABCDEFGH&key='+('a'.repeat(300)),
  ])('rejects malformed or mixed capabilities: %s',hash=>expect(readPersonalParticipationProof(hash)).toBeNull())
  it('does not generate links for invalid proof or a non-web destination',()=>{
    expect(personalParticipationLink('https://survey.example',id,{...proof,researchCode:'bad'})).toBe('')
    expect(personalParticipationLink('file:///tmp',id,proof)).toBe('')
  })
})
