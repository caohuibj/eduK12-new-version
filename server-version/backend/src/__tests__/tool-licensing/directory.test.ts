import {afterEach,describe,expect,it,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {AdminPermissionError} from '../../modules/admin-permissions/service'
import {eligibleBatchSubjects,listLicenseSubjects,listLicenseTools,requireLicenseSubject,requireLicenseTools} from '../../modules/tool-licensing/directory'

const id='10000000-0000-4000-8000-000000000001'
type Db=Parameters<typeof listLicenseTools>[0]
function database(rows:unknown[]=[]){
 const query=vi.fn().mockResolvedValue(rows)
 return {db:{$queryRaw:query} as unknown as Db,query}
}
afterEach(()=>vi.unstubAllEnvs())

describe('tool licence subject directory',()=>{
 it.each([['SCHOOL','HUISCHOOL'],['TEACHER','HUITEACHER']] as const)('uses the matching active school product: %s',async(product,entitlement)=>{
  const {db,query}=database([{id,label:'合成学校',description:'已开通'}])
  expect(await listLicenseSubjects(db,product,{q:'合成',page:2})).toEqual({list:[{id,label:'合成学校',description:'已开通'}],hasMore:false})
  const sql=query.mock.calls[0][0]
  expect(sql.text).toContain("o.product_domain='SCHOOL' AND o.status='ACTIVE'")
  expect(sql.text).toContain("e.status='ACTIVE'")
  expect(sql.values).toContain(entitlement)
  expect(sql.values.slice(-2)).toEqual([26,25])
 })
 it('requires a currently approved Training business teacher, not an entry administrator',async()=>{
  const {db,query}=database()
  await listLicenseSubjects(db,'TRAINING',{})
  const sql=query.mock.calls[0][0].text
  expect(sql).toContain("u.account_domain IN ('TRAINING','LEGACY') AND u.role='TEACHER' AND u.teacher_approved")
  expect(sql).toContain("u.platform_role='STANDARD'")
  expect(sql).toContain('NOT u.is_frozen AND NOT u.must_change_password')
  expect(sql).toContain('expires_at>clock_timestamp()')
  expect(sql).not.toContain('admin_entry_grants')
 })
 it('rechecks and locks the exact researcher, qualification and MFA inside the issuing transaction',async()=>{
  const row={id,label:'合成研究者',description:'synthetic_researcher'}
  const {db,query}=database([row])
  expect(await requireLicenseSubject(db,'SURVEY',id)).toEqual(row)
  const sql=query.mock.calls[0][0]
  expect(sql.text).toContain("u.account_domain='SURVEY' AND g.status='ACTIVE' AND m.enabled")
  expect(sql.text).toContain('JOIN survey_researcher_grants g')
  expect(sql.text).toContain('JOIN survey_mfa_credentials m')
  expect(sql.text).toContain('FOR SHARE OF u,g,m')
  expect(sql.values).toContainEqual([id])
 })
 it('locks the selected school and its matching active entitlement',async()=>{
  const {db,query}=database([{id,label:'合成学校'}])
  await requireLicenseSubject(db,'TEACHER',id)
  const sql=query.mock.calls[0][0]
  expect(sql.text).toContain('FOR SHARE OF o,e')
  expect(sql.values).toContain('HUITEACHER')
  expect(sql.values).toContainEqual([id])
 })
 it.each(['SCHOOL','TEACHER','TRAINING','SURVEY'] as const)('reads each %s batch once and locks only on confirmation',async(product)=>{
  const second='10000000-0000-4000-8000-000000000002'
  const {db,query}=database([{id,label:'合成对象'}])
  const ids=[id,second]
  await expect(eligibleBatchSubjects(db,product,ids,false)).resolves.toEqual(new Map([[id,{id,label:'合成对象'}]]))
  await eligibleBatchSubjects(db,product,ids,true)
  expect(query).toHaveBeenCalledTimes(2)
  const [preview,confirmation]=query.mock.calls.map(([sql])=>sql)
  expect(preview.text).not.toContain('FOR SHARE')
  expect(confirmation.text).toMatch(/ORDER BY [ou]\.id\s+FOR SHARE/)
  expect(confirmation.values).toContainEqual(ids)
 })
 it('does not accept an object that disappeared or lost qualification after selection',async()=>{
  const {db}=database()
  await expect(requireLicenseSubject(db,'TRAINING',id)).rejects.toMatchObject({statusCode:403})
 })
 it('paginates rather than returning all subjects',async()=>{
  const rows=Array.from({length:26},(_,index)=>({id:String(index),label:'synthetic '+index}))
  const {db}=database(rows)
  expect(await listLicenseSubjects(db,'SURVEY',{})).toEqual({list:rows.slice(0,25),hasMore:true})
 })
})

describe('tool licence tool directory',()=>{
 it('keeps literal search input parameterized, with one bounded metadata page',async()=>{
  const {db,query}=database()
  const q="%_' ; DROP TABLE users; --"
  await listLicenseTools(db,'SURVEY',{q,page:3})
  const sql=query.mock.calls[0][0]
  expect(sql.text).not.toContain(q)
  expect(sql.values).toContain(q)
  expect(sql.text).toContain('strpos(lower(name)')
  expect(sql.values.slice(-2)).toEqual([26,50])
  expect(sql.text).not.toContain('SELECT *')
  expect(sql.text).toContain("t.state='ONLINE'")
  expect(sql.text).toContain("policy.decision='APPROVED' AND NOT policy.paused")
 })
 it('retains stable standard/content keys and groups multiple available versions once',async()=>{
  const {db,query}=database()
  await listLicenseTools(db,'SCHOOL',{})
  const sql=query.mock.calls[0][0].text
  expect(sql).toContain("'SCALE:'||s.tool_key")
  expect(sql).toContain('m.content_key')
  expect(sql).toContain("s.state='ONLINE'")
  expect(sql).toContain("native.status='PUBLISHED'")
  expect(sql).toContain('GROUP BY key,family')
  expect(sql).toContain("stop.target_kind='RELEASE'")
 })
 it('does not advertise preview-only education governed packages as executable tools',async()=>{
  const {db,query}=database()
  await listLicenseTools(db,'TEACHER',{})
  const sql=query.mock.calls[0][0]
  expect(sql.text).toContain("t.family='FORM' AND t.state='ONLINE'")
  expect(sql.text).not.toContain("t.family IN ('SCALE','FORM','COGNITIVE','SJT','COMBINATION','BUNDLE')")
  expect(sql.text).toContain('bundle_package_releases')
  expect(sql.text).toContain("<>'youth'")
  expect(sql.values).not.toContain('ANONYMOUS_SELF')
  expect(sql.values).not.toContain('STUDENT_COURSE')
 })
 it('restricts Training governed tools to explicitly approved forms and combinations with approved forms',async()=>{
  vi.stubEnv('BUNDLE_PRODUCTS_ENABLED','false')
  const {db,query}=database()
  await listLicenseTools(db,'TRAINING',{})
  const sql=query.mock.calls[0][0].text
  expect(sql).toContain("t.family IN ('FORM','COMBINATION')")
  expect(sql).toContain("gp.product='TRAINING'")
  expect(sql).toContain("leaf.family='FORM' AND leaf.state='ONLINE'")
  expect(sql).not.toContain('FROM bundle_package_releases')
 })
 it('includes real Training native bundles only when that existing feature is enabled',async()=>{
  vi.stubEnv('BUNDLE_PRODUCTS_ENABLED','true')
  const {db,query}=database()
  await listLicenseTools(db,'TRAINING',{})
  const sql=query.mock.calls[0][0]
  expect(sql.text).toContain('FROM bundle_package_releases')
  expect(sql.text).toContain("bundle.status='PUBLISHED'")
  expect(sql.values).toContain('ANONYMOUS_SELF')
 })
 it('preserves caller order and validates all selected tools in one exact batch',async()=>{
  const scale={key:'SCALE:synthetic',name:'合成量表',family:'SCALE'}
  const form={key:'FORM:survey-draft:synthetic',name:'合成表单',family:'FORM'}
  const {db,query}=database([form,scale])
  expect(await requireLicenseTools(db,'SURVEY',[scale.key,form.key])).toEqual([scale,form])
  expect(query).toHaveBeenCalledTimes(1)
  expect(query.mock.calls[0][0].text).toContain('key=ANY(')
  expect(query.mock.calls[0][0].values).toContainEqual([scale.key,form.key])
 })
 it('rejects the entire selection when one current source is no longer eligible',async()=>{
  const {db}=database([{key:'SCALE:synthetic',name:'合成量表',family:'SCALE'}])
  await expect(requireLicenseTools(db,'SURVEY',['SCALE:synthetic','FORM:missing'])).rejects.toMatchObject({statusCode:403})
 })
 it.each([[],['SCALE:x','SCALE:x'],['UNKNOWN:x'],['SCALE:has space'],['SCALE:x\u0000'],Array.from({length:129},(_,i)=>'SCALE:'+i)])('rejects invalid/unbounded tool sets before querying: %j',async(keys)=>{
  const {db,query}=database()
  await expect(requireLicenseTools(db,'TRAINING',keys)).rejects.toBeInstanceOf(AdminPermissionError)
  expect(query).not.toHaveBeenCalled()
 })
 it('bounds pagination and rejects invalid identities before querying',async()=>{
  const {db,query}=database()
  await expect(listLicenseTools(db,'SURVEY',{page:0})).rejects.toMatchObject({statusCode:400})
  await expect(listLicenseSubjects(db,'SURVEY',{page:10001})).rejects.toMatchObject({statusCode:400})
  await expect(requireLicenseSubject(db,'TRAINING','not-an-id')).rejects.toMatchObject({statusCode:400})
  expect(query).not.toHaveBeenCalled()
 })
})
