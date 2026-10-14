import { describe,it,expect } from 'vitest'
import {readRecruitmentEntry,rememberRecruitmentEntry,clearRecruitmentEntry} from './recruitment-entry'

const id='11111111-2222-4333-8444-555555555555'
const other='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const token='a'.repeat(43)
const second='b'.repeat(43)
const storage=()=> {
  const values=new Map<string,string>()
  return {
    getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>{values.set(key,value)},
    removeItem:(key:string)=>{values.delete(key)},
    values,
  }
}
describe('Survey same-tab recruitment capability recovery',()=>{
  it('takes the valid fragment then survives URL hash removal and page refresh',()=>{
    const store=storage()
    expect(readRecruitmentEntry(id,'#entry='+token,store,100)).toBe(token)
    rememberRecruitmentEntry(id,token,store,100)
    expect(readRecruitmentEntry(id,'',store,101)).toBe(token)
    expect(readRecruitmentEntry(other,'',store,101)).toBe('')
  })
  it('does not renew the absolute deadline on reload',()=>{
    const store=storage()
    rememberRecruitmentEntry(id,token,store,100)
    rememberRecruitmentEntry(id,token,store,100+10*60*1000)
    expect(readRecruitmentEntry(id,'',store,100+29*60*1000)).toBe(token)
    expect(readRecruitmentEntry(id,'',store,100+30*60*1000)).toBe('')
  })
  it('new capability replaces an old token; one-time claim clears it',()=>{
    const store=storage()
    rememberRecruitmentEntry(id,token,store,100)
    rememberRecruitmentEntry(id,second,store,200)
    expect(readRecruitmentEntry(id,'',store,200)).toBe(second)
    clearRecruitmentEntry(id,store)
    expect(readRecruitmentEntry(id,'',store,201)).toBe('')
  })
  it('refuses malformed tokens, invalid project IDs, and future timestamps',()=>{
    const store=storage()
    rememberRecruitmentEntry(id,'short',store,100)
    expect(readRecruitmentEntry(id,'',store,100)).toBe('')
    rememberRecruitmentEntry('wrong',token,store,100)
    expect(readRecruitmentEntry('wrong','#entry='+token,store,100)).toBe('')
    rememberRecruitmentEntry(id,token,200)
    expect(readRecruitmentEntry(id,'',store,199)).toBe('')
    expect(readRecruitmentEntry(id,'#entry=not-valid',store,201)).toBe('')
  })
})
