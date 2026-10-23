import { randomUUID } from 'node:crypto'
import { beforeEach,describe,expect,it,vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { compileFrozenResearchUnit,type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { initialCognitiveDefinition } from '../../modules/survey/cognitive.definition'
import { loadSurveyCognitiveResultGroups,verifySurveyCognitiveReferences } from '../../modules/survey/cognitive.results'

beforeEach(()=>{process.env.DATA_ENCRYPTION_KEY='1'.repeat(64)})
const scope=()=>({projectId:randomUUID(),waveId:randomUUID(),attemptId:randomUUID(),publicationId:randomUUID()})
function group(count=1){
  const parent=scope()
  const rows=Array.from({length:count},(_,index)=>{
    const id=randomUUID(),sessionId=randomUUID(),slotKey='go'+index,measurementDigest='a'.repeat(64),rawHash='b'.repeat(64)
    const result={schemaVersion:1,sessionId,...parent,slotKey,epoch:1,measurementDigest,rawHash,
      testType:'gonogo',engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.1.0',timingPolicy:'software-frame-v1',
      audit:{trialCount:120},metrics:{hitRate:1},quality:{state:'valid'}}
    return {id,sessionId,...parent,slotKey,epoch:1,measurementDigest,rawHash,resultHash:canonicalHash(result),
      resultCipher:encryptUnifiedRuntimePayload(result),trialCount:120,completedAt:new Date()}
  })
  const references=rows.map(row=>({resultId:row.id,slotKey:row.slotKey,epoch:row.epoch,
    measurementDigest:row.measurementDigest,resultHash:row.resultHash}))
  return {input:{...parent,references},rows,sizes:rows.map(row=>({...parent,id:row.id,bytes:Buffer.byteLength(row.resultCipher)}))}
}
function mocked(groups:ReturnType<typeof group>[]){
  return {$queryRaw:vi.fn().mockResolvedValue(groups.flatMap(g=>g.sizes)),
    surveyCognitiveResult:{findMany:vi.fn().mockResolvedValue(groups.flatMap(g=>g.rows).reverse())}}
}
describe('Survey cognitive bounded metadata and grouped result reads',()=>{
  it('verifies four latest slots with one metadata-only query and rejects an old completed epoch',async()=>{
    const parent=scope(),units=Array.from({length:4},(_,i)=>compileFrozenResearchUnit({id:randomUUID(),
      instrumentKey:'go'+i,title:'Go',kind:'COGNITIVE',revision:1,definition:initialCognitiveDefinition()}))
    const references=units.map(unit=>({slotKey:unit.instrumentKey,epoch:1,resultId:randomUUID(),
      resultHash:'a'.repeat(64),measurementDigest:(unit.compiledDefinition as any).measurementDigest}))
    const sessions=references.map(ref=>({slotKey:ref.slotKey,epoch:1,status:'COMPLETED',result:{id:ref.resultId,...ref}}))
    const findMany=vi.fn().mockResolvedValue(sessions),tx={surveyCognitiveSession:{findMany}}
    const input={...parent,snapshot:{units} as ResearchFrozenPublication,references}
    await expect(verifySurveyCognitiveReferences(tx as any,input)).resolves.toEqual(references)
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0][0]).toMatchObject({where:{...parent,slotKey:{in:units.map(u=>u.instrumentKey)}},orderBy:{epoch:'desc'}})
    expect(JSON.stringify(findMany.mock.calls[0][0].select)).not.toMatch(/Cipher|randomSeed|lockedAnswers/)
    findMany.mockResolvedValueOnce([{slotKey:'go0',epoch:2,status:'IN_PROGRESS',result:null},...sessions])
    await expect(verifySurveyCognitiveReferences(tx as any,input)).rejects.toThrow('旧轮次')
  })
  it('loads eight exact parent groups in two reads, preserving parent/reference order and excluding raw',async()=>{
    const groups=Array.from({length:8},()=>group(4)),tx=mocked(groups)
    const result=await loadSurveyCognitiveResultGroups(tx as any,groups.map(g=>g.input))
    expect(result.map(children=>children.map(child=>child.reference))).toEqual(groups.map(g=>g.input.references))
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);expect(tx.surveyCognitiveResult.findMany).toHaveBeenCalledTimes(1)
    const query=tx.$queryRaw.mock.calls[0][0]
    expect(query.strings.join('')).toContain('octet_length(result_cipher)')
    expect(query.strings.join('')).not.toContain('raw_cipher')
    for(const g of groups){
      expect(query.values).toEqual(expect.arrayContaining([g.input.projectId,g.input.waveId,g.input.attemptId,g.input.publicationId,...g.input.references.map(r=>r.resultId)]))
    }
    expect(tx.surveyCognitiveResult.findMany.mock.calls[0][0].where.OR).toEqual(groups.map(g=>({
      projectId:g.input.projectId,waveId:g.input.waveId,attemptId:g.input.attemptId,publicationId:g.input.publicationId,
      id:{in:g.input.references.map(r=>r.resultId)},
    })))
    expect(tx.surveyCognitiveResult.findMany.mock.calls[0][0].select).not.toHaveProperty('rawCipher')
    expect(tx.surveyCognitiveResult.findMany.mock.calls[0][0].select).not.toHaveProperty('session')
    expect(result.flat().every(row=>row.raw===undefined&&row.randomSeed===undefined)).toBe(true)
  })
  it('retains empty groups without queries and rejects over-eight, duplicate scopes or raw batches before reads',async()=>{
    const empty={...scope(),references:[]},tx=mocked([])
    await expect(loadSurveyCognitiveResultGroups(tx as any,[])).resolves.toEqual([])
    await expect(loadSurveyCognitiveResultGroups(tx as any,[empty])).resolves.toEqual([[]])
    await expect(loadSurveyCognitiveResultGroups(tx as any,Array.from({length:9},()=>({...scope(),references:[]})))).rejects.toMatchObject({statusCode:413})
    await expect(loadSurveyCognitiveResultGroups(tx as any,[empty,empty])).rejects.toThrow('作用域重复')
    await expect(loadSurveyCognitiveResultGroups(tx as any,[{...empty,includeRaw:true} as any])).rejects.toMatchObject({statusCode:413})
    expect(tx.$queryRaw).not.toHaveBeenCalled();expect(tx.surveyCognitiveResult.findMany).not.toHaveBeenCalled()
  })
  it('allows exactly 256 KiB per child, 1 MiB per parent and 8 MiB active batch',async()=>{
    const groups=Array.from({length:8},()=>group(4))
    for(const g of groups)for(const row of g.sizes)row.bytes=256*1024
    const tx=mocked(groups)
    await expect(loadSurveyCognitiveResultGroups(tx as any,groups.map(g=>g.input))).resolves.toHaveLength(8)
    groups[7].sizes[3].bytes++
    tx.$queryRaw.mockResolvedValue(groups.flatMap(g=>g.sizes));tx.surveyCognitiveResult.findMany.mockClear()
    await expect(loadSurveyCognitiveResultGroups(tx as any,groups.map(g=>g.input))).rejects.toMatchObject({statusCode:413})
    expect(tx.surveyCognitiveResult.findMany).not.toHaveBeenCalled()
  })
  it.each(['projectId','waveId','attemptId','publicationId'] as const)('rejects %s substitution before fetching ciphertext',async field=>{
    const g=group(),tx=mocked([g]);g.sizes[0][field]=randomUUID()
    await expect(loadSurveyCognitiveResultGroups(tx as any,[g.input])).rejects.toThrow('无法匹配')
    expect(tx.surveyCognitiveResult.findMany).not.toHaveBeenCalled()
  })
  it('rejects missing or duplicate budget rows before fetching ciphertext',async()=>{
    const g=group(2),tx=mocked([g])
    tx.$queryRaw.mockResolvedValueOnce(g.sizes.slice(1)).mockResolvedValueOnce([g.sizes[0],g.sizes[0]])
    await expect(loadSurveyCognitiveResultGroups(tx as any,[g.input])).rejects.toThrow('无法匹配')
    await expect(loadSurveyCognitiveResultGroups(tx as any,[g.input])).rejects.toThrow('无法匹配')
    expect(tx.surveyCognitiveResult.findMany).not.toHaveBeenCalled()
  })
  it('rejects cross-parent references without accepting an ID from another exact group',async()=>{
    const a=group(),b=group(),tx=mocked([a,b])
    await expect(loadSurveyCognitiveResultGroups(tx as any,[{...a.input,references:b.input.references},b.input])).rejects.toThrow('无法匹配')
    expect(tx.surveyCognitiveResult.findMany).not.toHaveBeenCalled()
  })
  it('rechecks fetched scalar scope and decrypted source/hash even after valid size checks',async()=>{
    const g=group(),tx=mocked([g])
    tx.surveyCognitiveResult.findMany.mockResolvedValueOnce([{...g.rows[0],waveId:randomUUID()}])
    await expect(loadSurveyCognitiveResultGroups(tx as any,[g.input])).rejects.toThrow('无法匹配')
    tx.surveyCognitiveResult.findMany.mockResolvedValueOnce([{...g.rows[0],resultCipher:encryptUnifiedRuntimePayload({wrong:'source'})}])
    await expect(loadSurveyCognitiveResultGroups(tx as any,[g.input])).rejects.toThrow('摘要校验')
    tx.surveyCognitiveResult.findMany.mockResolvedValueOnce([])
    await expect(loadSurveyCognitiveResultGroups(tx as any,[g.input])).rejects.toThrow('无法匹配')
  })
})
