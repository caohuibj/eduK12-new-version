import {describe,it,expect,vi,afterEach} from 'vitest'
const m=vi.hoisted(()=>({consume:vi.fn()}))
vi.mock('../../services/cacheService',()=>({cacheService:{consumeRateLimit:m.consume}}))
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {rosterJobInput,validateWholeRoster,rosterParts} from '../../modules/education-roster/jobs.schema'
const staff=(n:number)=>rosterJobInput.parse({kind:'STAFF',rows:Array.from({length:n},(_,i)=>({line:i+1,number:'N'+i,name:'合成'+i}))})
describe('roster full-file bounds and unchanged write protection',()=>{
 afterEach(()=>vi.unstubAllEnvs())
 it('allows 5000 rows as 50 bounded parts and rejects 5001 without truncation',()=>{const input=staff(5000);validateWholeRoster(input);expect(rosterParts(input)).toHaveLength(50);expect(rosterParts(input).every(p=>p.rows.length===100)).toBe(true);expect(()=>staff(5001)).toThrow()})
 it('rejects repeated physical lines and does not retain a raw row in errors',()=>{const input=staff(2);input.rows[1].line=1;try{validateWholeRoster(input);throw Error('expected refusal')}catch(e:any){expect(e.code).toBe('ROSTER_WHOLE_FILE_INVALID');expect(e.issues[0].message).not.toContain('合成')}})
 it('refuses privilege/password fields and unbounded normalized content',()=>{
  expect(()=>rosterJobInput.parse({kind:'STAFF',role:'ADMIN',rows:[{line:2,number:'T1',password:'blocked'}]})).toThrow()
  const input=staff(5000);input.rows.forEach(r=>{r.name='长'.repeat(100);if('grade'in r)r.grade='级'.repeat(200)});expect(()=>validateWholeRoster(input)).toThrow('过大')
 })
 it('keeps the real production Redis write key, limit and Retry-After behavior',async()=>{
  vi.stubEnv('NODE_ENV','production');m.consume.mockResolvedValue({allowed:false,remaining:0,retryAfterSeconds:125})
  const headers:Record<string,string>={},res:any={setHeader:(k:string,v:string)=>{headers[k]=v},status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn()
  await createRedisRateLimiter({name:'campus-personnel',limit:40,windowSeconds:900})({ip:'127.0.0.1'} as any,res,next)
  expect(m.consume).toHaveBeenCalledWith(expect.stringMatching(/^ratelimit:campus-personnel:[a-f0-9]{64}$/),40,900);expect(res.status).toHaveBeenCalledWith(429);expect(headers['Retry-After']).toBe('125');expect(next).not.toHaveBeenCalled()
 })
})
