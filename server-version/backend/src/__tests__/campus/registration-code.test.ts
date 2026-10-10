import {describe,it,expect,vi,beforeEach} from 'vitest'
import {createHash} from 'node:crypto'
const query=vi.hoisted(()=>vi.fn())
vi.mock('../../config/database',()=>({prisma:{$queryRaw:query}}))
import {resolveCampusRegistrationCode,CampusRegistrationCodeError} from '../../modules/campus/registration-code'
const code='abcdefghijklmnopqrstuvwx'
beforeEach(()=>query.mockReset())
describe('registration discovery',()=>{
 it.each([
  [[{organizationId:'school',classUnitId:'class'}],[],[],{kind:'STUDENT',organizationId:'school',classUnitId:'class'}],
  [[],[{available:true}],[],{kind:'PARENT'}],
  [[],[],[{persona:'TEACHER',adminRole:false}],{kind:'STAFF',role:'TEACHER'}],
  [[],[],[{persona:'COUNSELOR',adminRole:false}],{kind:'STAFF',role:'COUNSELOR'}],
  [[],[],[{persona:'COUNSELOR',adminRole:true}],{kind:'STAFF',role:'ADMIN'}],
 ])('maps only one persisted match to its form',async(students,parents,staff,expected)=>{
  query.mockResolvedValueOnce(students).mockResolvedValueOnce(parents).mockResolvedValueOnce(staff)
  expect(await resolveCampusRegistrationCode(' '+code+' ')).toEqual(expected)
  expect(query).toHaveBeenCalledTimes(3)
  const salts=['','parent-invite-v1:','school-staff-invite:v1:']
  query.mock.calls.forEach(([sql,...params],index)=>{
   expect(sql.join('?')).not.toContain(code)
   expect(params).toEqual([createHash('sha256').update(salts[index]+code).digest('hex')])
  })
 })
 it.each([[[],[],[]],[[{organizationId:'s',classUnitId:'c'}],[{available:true}],[]],[[],[],[{persona:'TEACHER',adminRole:false},{persona:'COUNSELOR',adminRole:true}]]])('uniformly refuses unavailable or ambiguous data',async(a,b,c)=>{
  query.mockResolvedValueOnce(a).mockResolvedValueOnce(b).mockResolvedValueOnce(c)
  await expect(resolveCampusRegistrationCode(code)).rejects.toBeInstanceOf(CampusRegistrationCodeError)
 })
 it.each(['short','x'.repeat(65),'../../'+'x'.repeat(24)])('rejects malformed code without any database access',async raw=>{
  await expect(resolveCampusRegistrationCode(raw)).rejects.toBeInstanceOf(CampusRegistrationCodeError)
  expect(query).not.toHaveBeenCalled()
 })
 it('propagates a database failure without choosing another identity',async()=>{
  query.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce([]).mockResolvedValueOnce([{persona:'TEACHER',adminRole:false}])
  await expect(resolveCampusRegistrationCode(code)).rejects.toThrow('database unavailable')
 })
})
