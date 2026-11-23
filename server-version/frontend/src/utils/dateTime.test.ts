import {expect,it} from 'vitest'
import {formatLocalDateTime} from './dateTime'
it('shows the local date, time and UTC offset by default',()=>{
 const input='2026-11-23T04:17:00Z',date=new Date(input)
 const pad=(v:number)=>String(v).padStart(2,'0')
 const result=formatLocalDateTime(input)
 expect(result).toContain(`${pad(date.getHours())}:${pad(date.getMinutes())}`)
 expect(result).toContain(String(date.getFullYear()))
 expect(result).toContain('UTC')
 expect(formatLocalDateTime('invalid')).toBe('无效日期')
})
