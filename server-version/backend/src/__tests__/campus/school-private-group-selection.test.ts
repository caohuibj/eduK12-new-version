import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {parseSchoolPrivateGroupSelection,schoolPrivateGroupSelectionHash} from '../../modules/education-tools/school-private-group-selection'

describe('School explicit private group publisher selection (not publication)',()=>{
 const a={blockId:randomUUID(),versionId:randomUUID(),contentHash:'a'.repeat(64),minimumRespondents:10,
  audiences:{PROFESSIONAL:['score','second'],TEACHER:[],ORGANIZATION:['score']}}
 const b={...a,blockId:randomUUID(),versionId:randomUUID(),contentHash:'b'.repeat(64),audiences:{PROFESSIONAL:[],TEACHER:['score'],ORGANIZATION:[]}}
 const context={entry:'SCHOOL' as const,administration:{population:'STUDENT',responseMode:'SELF'},sources:[a,b]}
 const selected={schemaVersion:1,minimumRespondents:10,leaves:[{
  blockId:a.blockId,versionId:a.versionId,contentHash:a.contentHash,audiences:{PROFESSIONAL:['second','score'],TEACHER:[],ORGANIZATION:[]},
 },{blockId:b.blockId,versionId:b.versionId,contentHash:b.contentHash,audiences:{PROFESSIONAL:[],TEACHER:['score'],ORGANIZATION:[]}}]}
 it('retains separate audience and block ceilings, canonicalizes order and never selects a fallback audience',()=>{
  const result=parseSchoolPrivateGroupSelection(selected,context)
  expect(result.leaves.find(leaf=>leaf.blockId===a.blockId)?.audiences).toEqual({PROFESSIONAL:['score','second'],TEACHER:[],ORGANIZATION:[]})
  const reordered={...selected,leaves:[...selected.leaves].reverse().map(leaf=>({...leaf,audiences:{...leaf.audiences,PROFESSIONAL:[...leaf.audiences.PROFESSIONAL].reverse()}}))}
  expect(schoolPrivateGroupSelectionHash(parseSchoolPrivateGroupSelection(reordered,context))).toBe(schoolPrivateGroupSelectionHash(result))
 })
 it('rejects stale fixed sources, same-named score borrowing, insufficient N and non-School SELF',()=>{
  const change=(patch:Record<string,unknown>)=>({...selected,leaves:[{...selected.leaves[0],...patch}]})
  expect(()=>parseSchoolPrivateGroupSelection(change({contentHash:'c'.repeat(64)}),context)).toThrow()
  expect(()=>parseSchoolPrivateGroupSelection(change({audiences:{PROFESSIONAL:[],TEACHER:['score'],ORGANIZATION:[]}}),context)).toThrow()
  expect(()=>parseSchoolPrivateGroupSelection({...selected,minimumRespondents:10},{...context,sources:[{...a,minimumRespondents:15},b]})).toThrow()
  expect(()=>parseSchoolPrivateGroupSelection(selected,{...context,entry:'TEACHER'})).toThrow()
  expect(()=>parseSchoolPrivateGroupSelection(selected,{...context,administration:{population:'STUDENT',responseMode:'TEACHER_REPORT'}})).toThrow()
  expect(()=>parseSchoolPrivateGroupSelection({...selected,leaves:[]},context)).toThrow()
  expect(()=>parseSchoolPrivateGroupSelection({...selected,leaves:[selected.leaves[0],selected.leaves[0]]},context)).toThrow()
 })
})
