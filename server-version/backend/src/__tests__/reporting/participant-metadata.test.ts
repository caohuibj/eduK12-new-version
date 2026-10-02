import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {prisma} from '../../config/database'
import {relationalProductRegistry} from '../../modules/assessment-relational/product-registry'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {reportingSpecHash} from '../../modules/reporting/spec'
import {listParticipantLongitudinalMetadata} from '../../modules/reporting/participantMetadata'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
const definition:any={schemaVersion:1,analysisKind:'INDIVIDUAL_LONGITUDINAL',engineKey:'ORG_INDIVIDUAL_LONGITUDINAL_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'score',sourceMetricKey:'score',sourceFamily:'SCALE',sourceResourceKey:'tool',valueType:'NUMBER',longitudinalMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',missingnessRule:'EXCLUDE',observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],comparabilityRules:[]}
const contract=testDisclosure();contract.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:['score']}
const policy={resultDisclosure:contract},candidate=(id:string)=>({id,generatedAt:new Date('2026-10-02'),definition,specHash:reportingSpecHash(definition)})
const wave=(artifactId:string,index:number)=>({artifactId,waveId:artifactId+'-wave-'+index,family:'SCALE',key:'tool',version:'1.0.0',runStatus:'PUBLISHED',policy,hash:canonicalHash(policy),observations:[{subjectUserId:'owner',executionId:'exec-'+index}],executions:['exec-'+index]})
beforeEach(()=>{vi.spyOn(relationalProductRegistry,'findExact').mockReturnValue({releaseStatus:'PUBLISHED',resultDisclosure:contract} as any)})
afterEach(()=>vi.restoreAllMocks())
describe('participant metadata batch list',()=>{
 it.each([1,20])('uses three queries for %i reports and returns metadata without projections',async n=>{
  const candidates=Array.from({length:n},(_,i)=>candidate('a'+i)),rows=candidates.flatMap(r=>[wave(r.id,1),wave(r.id,2)])
  const query=vi.spyOn(prisma,'$queryRaw').mockResolvedValueOnce(candidates).mockResolvedValueOnce(rows).mockResolvedValueOnce(candidates.map(r=>({id:r.id})))
  const result=await listParticipantLongitudinalMetadata('owner');expect(result.list).toHaveLength(n);expect(query).toHaveBeenCalledTimes(3);expect(Object.keys(result.list[0])).toEqual(['id','generatedAt'])
  const sql=query.mock.calls.map(call=>(call[0] as any).strings.join('')).join(' ');expect(sql).not.toContain('artifact_payload');expect(sql).toContain('subject_user_id=');expect(sql).toContain('organization_access_denies')
 })
 it('empty list needs one query; current denial removes previously eligible metadata',async()=>{
  const query=vi.spyOn(prisma,'$queryRaw').mockResolvedValueOnce([]);expect((await listParticipantLongitudinalMetadata('owner')).list).toEqual([]);expect(query).toHaveBeenCalledTimes(1)
  query.mockClear();query.mockResolvedValueOnce([candidate('a')]).mockResolvedValueOnce([wave('a',1),wave('a',2)]).mockResolvedValueOnce([]);expect((await listParticipantLongitudinalMetadata('owner')).list).toEqual([])
 })
 it.each(['wrong-owner','ambiguous-execution','cancelled-run','policy-changed'])('does not list %s wave',async failure=>{
  const first=wave('a',1),second=wave('a',2)
  if(failure==='wrong-owner')second.observations[0].subjectUserId='other'
  if(failure==='ambiguous-execution')second.executions.push('other')
  if(failure==='cancelled-run')second.runStatus='CANCELLED'
  if(failure==='policy-changed')second.hash='f'.repeat(64)
  vi.spyOn(prisma,'$queryRaw').mockResolvedValueOnce([candidate('a')]).mockResolvedValueOnce([first,second]).mockResolvedValueOnce([{id:'a'}]);expect((await listParticipantLongitudinalMetadata('owner')).list).toEqual([])
 })
})
