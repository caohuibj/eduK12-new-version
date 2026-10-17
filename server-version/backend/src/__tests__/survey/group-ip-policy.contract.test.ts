import { describe,expect,it } from 'vitest'
import { GROUP_IP_MAX_WINDOW_MS,GroupIpPolicyError,groupIpDraftPolicySchema,
  groupIpFrozenPolicySchema,freezeGroupIpPolicy,resolveGroupIpOpenWindow,
  isGroupIpWindowActive,assertGroupIpWindowActive,isValidGroupIpTimeZone,
  type GroupIpWindowState } from '../../modules/survey/group-ip-policy'

const at=(value:string)=>new Date(value)
const now=at('2026-10-17T02:00:00.000Z')
const draft={schemaVersion:1 as const,timeZone:'Asia/Shanghai'}
const frozen=freezeGroupIpPolicy(draft,now)!
const active=(start=now):GroupIpWindowState=>({
  groupIpPolicy:freezeGroupIpPolicy(draft,start),
  ...resolveGroupIpOpenWindow(freezeGroupIpPolicy(draft,start),{},start)!,
})

describe('Survey opt-in group IP frozen policy',()=>{
  it('defaults old/ordinary waves to no policy and does not invent a clock or window',()=>{
    expect(freezeGroupIpPolicy(null,now)).toBeNull()
    expect(freezeGroupIpPolicy(undefined,now)).toBeNull()
    expect(resolveGroupIpOpenWindow(null,{closesAt:at('2027-01-01T00:00:00Z')},now)).toBeNull()
    expect(isGroupIpWindowActive({},now)).toBe(false)
    expect(()=>assertGroupIpWindowActive({},now)).not.toThrow()
    expect(()=>assertGroupIpWindowActive({groupIpPolicy:null,groupIpActivatedAt:now},now)).toThrow(GroupIpPolicyError)
  })
  it.each(['Asia/Shanghai','America/New_York','Europe/London','Pacific/Kiritimati','UTC','Etc/GMT+8'])(
    'accepts IANA timezone %s',zone=>expect(isValidGroupIpTimeZone(zone)).toBe(true))
  it.each(['','Mars/Nowhere','+08:00','-0500',' Asia/Shanghai','Asia/Shanghai ', 'A'.repeat(101)])(
    'rejects invalid or numeric timezone %s',zone=>{
      expect(isValidGroupIpTimeZone(zone)).toBe(false)
      expect(groupIpDraftPolicySchema.safeParse({...draft,timeZone:zone}).success).toBe(false)
    })
  it('rejects injected activation dates, extra keys, versions, and invalid frozen calendar dates',()=>{
    for(const value of [{...draft,activationDate:'2026-10-18'},{...draft,enabled:true},{...draft,schemaVersion:2}])
      expect(()=>freezeGroupIpPolicy(value,now)).toThrow(GroupIpPolicyError)
    expect(groupIpFrozenPolicySchema.safeParse({...frozen,activationDate:'2026-02-30'}).success).toBe(false)
  })
  it('derives publication day from server freeze time in its selected timezone',()=>{
    expect(freezeGroupIpPolicy(draft,at('2026-10-16T15:59:59.999Z'))!.activationDate).toBe('2026-10-16')
    expect(freezeGroupIpPolicy(draft,at('2026-10-16T16:00:00.000Z'))!.activationDate).toBe('2026-10-17')
    const p=freezeGroupIpPolicy(draft,at('2026-10-16T15:59:59.999Z'))!
    expect(()=>resolveGroupIpOpenWindow(p,{},at('2026-10-16T16:00:00.000Z'))).toThrow(/发布当天/)
  })
  it('opens immediately on the frozen local day, and has no finishing grace',()=>{
    const later=at('2026-10-17T03:00:00.000Z')
    const window=resolveGroupIpOpenWindow(frozen,{opensAt:now},later)!
    expect(window.opensAt).toEqual(later)
    expect(window.groupIpActivatedAt).toEqual(later)
    expect(window.closesAt.getTime()-later.getTime()).toBe(GROUP_IP_MAX_WINDOW_MS)
    expect(window.finishUntil).toEqual(window.closesAt)
    const close=at('2026-10-17T04:00:00.000Z')
    expect(resolveGroupIpOpenWindow(frozen,{closesAt:close,finishUntil:close},later)?.finishUntil).toEqual(close)
  })
  it('rejects scheduled openings and dates from another local day',()=>{
    expect(()=>resolveGroupIpOpenWindow(frozen,{opensAt:new Date(now.getTime()+1)},now)).toThrow(/立即开始/)
    expect(()=>resolveGroupIpOpenWindow(frozen,{opensAt:at('2026-10-16T15:59:59Z')},now)).toThrow(/立即开始/)
    expect(()=>resolveGroupIpOpenWindow(frozen,{},at('2026-10-17T16:00:00Z'))).toThrow(/发布当天/)
  })
  it('rejects non-future close, invalid dates, more than 48h and any finish-time mismatch',()=>{
    for(const close of [now,new Date(now.getTime()-1),new Date(now.getTime()+GROUP_IP_MAX_WINDOW_MS+1),new Date(NaN)])
      expect(()=>resolveGroupIpOpenWindow(frozen,{closesAt:close},now)).toThrow(GroupIpPolicyError)
    const close=new Date(now.getTime()+GROUP_IP_MAX_WINDOW_MS)
    expect(()=>resolveGroupIpOpenWindow(frozen,{closesAt:close,finishUntil:new Date(close.getTime()+1)},now)).toThrow(/不设延长宽限/)
    expect(()=>resolveGroupIpOpenWindow(frozen,{closesAt:close,finishUntil:new Date(close.getTime()-1)},now)).toThrow(/不设延长宽限/)
  })
  it.each(['2026-03-07T17:00:00.000Z','2026-10-31T16:00:00.000Z'])(
    'keeps exactly 48 elapsed hours across DST at %s',stamp=>{
      const start=at(stamp),policy=freezeGroupIpPolicy({...draft,timeZone:'America/New_York'},start)
      const window=resolveGroupIpOpenWindow(policy,{},start)!
      expect(window.closesAt.getTime()-start.getTime()).toBe(172800000)
      expect(isGroupIpWindowActive({groupIpPolicy:policy,...window},new Date(start.getTime()+172799999))).toBe(true)
      expect(isGroupIpWindowActive({groupIpPolicy:policy,...window},new Date(start.getTime()+172800000))).toBe(false)
    })
  it('does not revive after expiry, or trust manipulated persisted windows',()=>{
    const wave=active(),end=wave.closesAt!
    expect(isGroupIpWindowActive(wave,now)).toBe(true)
    expect(isGroupIpWindowActive(wave,new Date(now.getTime()-1))).toBe(false)
    expect(()=>assertGroupIpWindowActive(wave,new Date(end.getTime()-1))).not.toThrow()
    expect(()=>assertGroupIpWindowActive(wave,end)).toThrow(/不能恢复或延长/)
    for(const changed of [
      {closesAt:new Date(end.getTime()+1)},
      {finishUntil:new Date(end.getTime()+1)},
      {opensAt:new Date(now.getTime()-1)},
      {groupIpPolicy:{...frozen,activationDate:'2026-10-18'}},
      {hardStopAt:now},{groupIpActivatedAt:null},{closesAt:null},
    ])expect(isGroupIpWindowActive({...wave,...changed},now)).toBe(false)
  })
  it('honors an early close or hard stop without a two-hour grace',()=>{
    const wave=active(),stop=new Date(now.getTime()+3600000)
    expect(isGroupIpWindowActive({...wave,finishUntil:stop},new Date(stop.getTime()-1))).toBe(true)
    expect(isGroupIpWindowActive({...wave,finishUntil:stop},stop)).toBe(false)
    expect(isGroupIpWindowActive({...wave,hardStopAt:stop},stop)).toBe(false)
  })
})
