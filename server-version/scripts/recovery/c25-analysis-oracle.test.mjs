/** New C19-supplement contracts only. No application imports or services.
 * Synthetic HTTP/manifest/CSV fixtures exercise the oracle, not the product.
 * Runtime evidence must still come from real HTTP, queue and downloaded bytes.
 */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import test from 'node:test'
import {assertSuppressedAnalysis,assertLongCsv} from './c25-analysis-oracle.mjs'

// Independently authored fixture header and JSON encoder. Never import product
// serializers/tables or an oracle-generated expected CSV into these contracts.
const header=['participantKind','participantKey','waveKey','taskId','publication','configDigest','variantKey','itemId','metricKey','columnKey','attemptId','attemptEpoch','originalFinalStatus','taskSatisfied','sourceHashes','instrumentKey','scoreKey','scoringDigest','responseSignature','respondentType','unit','version','value','reason']
const identityFields=['instrumentKey','scoreKey','scoringDigest','responseSignature','respondentType','unit','version']
const reasons=['QUALITY_EXCLUDED','NOT_COMPARABLE','NOT_ASSIGNED','UNANSWERED','NON_FINAL','NOT_ATTEMPTED','INVALID_VALUE','MISSING_SOURCE','LEGACY_UNSCOPED','IDENTITY_UNAVAILABLE','NO_OBSERVATION','NOT_CALCULABLE']
const limitations=['DESCRIPTIVE_RESEARCH_ONLY','NO_CAUSAL_OR_DIAGNOSTIC_INTERPRETATION','UNIQUE_OR_REJECT','NO_CROSS_STRATUM_POOLING']
const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])])):value
const json=value=>JSON.stringify(normalize(value))
const digest=value=>createHash('sha256').update(json(value)).digest('hex')
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const h=n=>String(n).repeat(64)
const csv=(rows,columns=header)=>Buffer.from('\uFEFF'+[columns,...rows.map(row=>columns.map(field=>row[field]))].map(cells=>cells.map(cell=>'"'+String(cell??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n','utf8')

function fixture(measurementChanges={}) {
  const measurement={instrumentKey:'MIXED_SCALE',scoreKey:'total',scoringDigest:h(1),responseSignature:h(2),respondentType:'SELF',unit:'score',version:'1.0.0',...measurementChanges}
  const selector={schemaVersion:1,courseId:uuid(1),mode:'PAIRWISE',waves:[
    {waveKey:'wave_a',taskId:uuid(10),publication:'2026-10-19T12:00:00.000Z',configDigest:null,variantKey:null,metrics:[{itemId:uuid(11),metricKey:'total'}]},
    {waveKey:'wave_b',taskId:uuid(20),publication:'2026-10-19T12:00:01.000Z',configDigest:null,variantKey:null,metrics:[{itemId:uuid(21),metricKey:'total'}]},
  ]}
  const actors={M:uuid(100),S:uuid(101)}
  const attempts={MA:{attemptId:uuid(200),attemptEpoch:1},MB:{attemptId:uuid(201),attemptEpoch:2},SA:{attemptId:uuid(202),attemptEpoch:1}}
  const columns=selector.waves.map(wave=>({waveKey:wave.waveKey,taskId:wave.taskId,publication:wave.publication,configDigest:null,variantKey:null,itemId:wave.metrics[0].itemId,metricKey:'total',
    columnKey:'m_'+digest({waveKey:wave.waveKey,scope:JSON.stringify([wave.taskId,wave.publication,null,null]),itemId:wave.metrics[0].itemId,metricKey:'total'}),
    measurement:structuredClone(measurement),valueType:'NUMBER',missingReasons:[...reasons]}))
  const observed=[['MA','M',0,1,null],['MB','M',1,0,null],['SA','S',0,null,'NOT_ASSIGNED']]
  const sources=observed.map(([name,actor,index,value,reason])=>{
    const wave=selector.waves[index],sourceHashes={participant:digest({participantKind:'USER',participantKey:`user:${actors[actor]}`}),parent:h(3),
      publication:digest({taskId:wave.taskId,publication:wave.publication,configDigest:null,variantKey:null}),...(reason===null?{[wave.metrics[0].itemId]:h(4),[`scale:${wave.metrics[0].itemId}`]:h(5)}:{})}
    const sourceHash=digest({sourceHashes,observations:[{metricKey:'total',itemId:wave.metrics[0].itemId,measurement:reason===null?measurement:null,value,reason}]})
    return {waveKey:wave.waveKey,taskId:wave.taskId,...attempts[name],sourceHash,sourceHashes:{...sourceHashes,sourceHash},status:'COMPLETED',taskSatisfaction:reason===null?'SATISFIED':'NOT_SATISFIED'}
  }).sort((a,b)=>`${a.waveKey}:${a.taskId}:${a.attemptId}`.localeCompare(`${b.waveKey}:${b.taskId}:${b.attemptId}`))
  const quality=sources.map(source=>({attemptId:source.attemptId,attemptEpoch:source.attemptEpoch,sourceHash:source.sourceHash,status:source.status,taskSatisfaction:source.taskSatisfaction,verdict:'INCLUDE',reason:null,revision:0}))
    .sort((a,b)=>`${a.attemptId}:${a.attemptEpoch}:${a.sourceHash}`.localeCompare(`${b.attemptId}:${b.attemptEpoch}:${b.sourceHash}`))
  const unsigned={schemaVersion:1,kind:'TRAINING_ANALYSIS',courseId:selector.courseId,actor:{id:uuid(300),role:'TEACHER'},selector:structuredClone(selector),definitionHash:digest(selector),sourceHash:digest(sources),qualityHash:digest(quality),authorityHash:h(6),sourceCutoff:'2026-10-19T12:01:00.000Z',sources,dictionary:columns,observationCount:3}
  const manifest={...unsigned,manifestHash:digest(unsigned)}
  const summary=Object.fromEntries(['schemaVersion','manifestHash','definitionHash','sourceHash','qualityHash','authorityHash','sourceCutoff','observationCount'].map(field=>[field,manifest[field]]))
  summary.sourceCount=3
  const analysisPayload={manifest:summary,quality:{list:quality,total:3,page:1,pageSize:25},analysis:{schemaVersion:1,kind:'TRAINING_NUMERIC_LONGITUDINAL',courseId:selector.courseId,mode:'PAIRWISE',minimumN:5,state:'suppressed',
    descriptives:columns.map(({columnKey:_column,valueType:_type,missingReasons:_reasons,...column})=>({...column,state:'suppressed'})).reverse(),
    metrics:[{metricKey:'total',state:'suppressed',countKind:'PAIRED_VALID',flow:[{fromWaveKey:'wave_a',toWaveKey:'wave_b',basis:'OBSERVED_SAMPLE',state:'suppressed'}]}],limitations:[...limitations]}}
  const expected={selector,measurement,actors,attempts,manifest,analysisPayload}
  const rows=[['M',0,'MA','1','',true],['M',1,'MB','0','',true],['S',0,'SA','','NOT_ASSIGNED',false],['S',1,null,'','NO_OBSERVATION',true]].map(([actor,index,name,value,reason,hasMeasurement])=>{
    const column=columns[index],source=name?sources.find(row=>row.attemptId===attempts[name].attemptId):null
    return {participantKind:'USER',participantKey:'p_'+digest({schemaVersion:1,courseId:selector.courseId,participantKind:'USER',participantKey:`user:${actors[actor]}`}).slice(0,32),
      waveKey:column.waveKey,taskId:column.taskId,publication:column.publication,configDigest:'',variantKey:'',itemId:column.itemId,metricKey:'total',columnKey:column.columnKey,
      attemptId:source?.attemptId??'',attemptEpoch:source?String(source.attemptEpoch):'',originalFinalStatus:source?'COMPLETED':'',taskSatisfied:source?String(name!=='SA'):'',sourceHashes:source?json(source.sourceHashes):'{}',
      ...Object.fromEntries(identityFields.map(field=>[field,hasMeasurement?measurement[field]:''])),value,reason}
  })
  return {expected,rows,payload:analysisPayload,bytes:csv(rows)}
}

test('actual response data accepts legitimate manifest/quality counts and every suppressed projection shape',()=>{
  const f=fixture(),before=structuredClone(f.expected)
  assert.deepEqual(assertSuppressedAnalysis(f.payload,f.expected),{state:'suppressed',minimumN:5,descriptiveCount:2,metricCount:1,sourceCount:3,observationCount:3,manifestHash:f.payload.manifest.manifestHash})
  assert.equal(f.payload.quality.list.length,3)
  assert.equal(Object.hasOwn(f.payload.analysis.metrics[0],'comparisons'),false)
  assert.deepEqual(f.expected,before,'pure oracle does not mutate caller objects')
})

test('actual byte oracle checks all four cells independent of row/descriptive order, with zero and different missingness',()=>{
  const f=fixture(),before=structuredClone(f.expected)
  const bytes=csv([f.rows[3],f.rows[1],f.rows[2],f.rows[0]])
  const result=assertLongCsv(bytes,f.expected)
  assert.deepEqual(result,{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,rowCount:4,columnCount:24,pairedValidN:1,measuredValues:{MA:1,MB:0},missingReasons:{SA:'NOT_ASSIGNED',SB:'NO_OBSERVATION'},scope:'PAIRED_N_1_ONLY'})
  assert.deepEqual(f.expected,before)
  // Source-hash JSON already exercises escaped quotes and commas.
  assert.match(bytes.toString('utf8'),/""participant""/)
  const quoted=fixture({version:'v1, "quoted" 测试'})
  assert.equal(assertLongCsv(quoted.bytes,quoted.expected).rowCount,4)
})

test('reject every sensitive statistical/count field even when its leaked value is null or zero',()=>{
  for (const [target,fields] of [
    ['analysis',['matchedEligibleN']],
    ['descriptive',['eligibleN','validN','statistics','missingByReason']],
    ['metric',['reason','validCaseN','waveMeans','comparisons','delta']],
    ['flow',['fromObservedN','toObservedN','retainedN','attritionN','lateJoiningN']],
  ]) for (const field of fields) for (const value of [null,0]) {
    const f=fixture(),analysis=f.payload.analysis
    const node=target==='analysis'?analysis:target==='descriptive'?analysis.descriptives[0]:target==='metric'?analysis.metrics[0]:analysis.metrics[0].flow[0]
    node[field]=value
    assert.throws(()=>assertSuppressedAnalysis(f.payload,f.expected),undefined,`${target}.${field}=${value}`)
  }
})

test('reject not_comparable masquerading as overall suppression, wrong flow/count kind or missing shapes',()=>{
  for (const mutate of [
    f=>{f.payload.analysis.metrics[0].state='not_comparable'},
    f=>{Object.assign(f.payload.analysis.metrics[0],{state:'not_comparable',reason:'NOT_COMPARABLE',comparisons:[]})},
    f=>{f.payload.analysis.metrics[0].countKind='COMPLETE_CASE'},
    f=>{f.payload.analysis.metrics[0].flow[0].basis='ELIGIBLE_SAMPLE'},
    f=>{f.payload.analysis.metrics[0].flow[0].fromWaveKey='wave_b'},
    f=>{f.payload.analysis.metrics=[]},f=>{f.payload.analysis.descriptives.pop()},
    f=>{f.payload.analysis.descriptives[1]=structuredClone(f.payload.analysis.descriptives[0])},
    f=>{f.payload.analysis.minimumN=1},f=>{f.payload.analysis.state='present'},
  ]) {const f=fixture();mutate(f);assert.throws(()=>assertSuppressedAnalysis(f.payload,f.expected))}
})

test('all seven scientific fields must be complete and equal across HTTP waves, including score unit',()=>{
  for (const field of identityFields) for (const value of ['',null,'mismatch']) {
    const f=fixture();f.payload.analysis.descriptives[0].measurement[field]=value
    assert.throws(()=>assertSuppressedAnalysis(f.payload,f.expected),undefined,`${field}=${value}`)
  }
  const wrongUnit=fixture({unit:'points'})
  assert.throws(()=>assertSuppressedAnalysis(wrongUnit.payload,wrongUnit.expected),/compiled Scale unit/)
})

test('manifest counts distinguish attempt sources from publications and dense exported cells',()=>{
  for (const field of ['sourceCount','observationCount']) for (const wrong of [2,4]) {
    const f=fixture();f.payload.manifest[field]=wrong
    assert.throws(()=>assertSuppressedAnalysis(f.payload,f.expected),undefined,`${field}=${wrong}`)
  }
  const f=fixture();f.payload.manifest.definitionHash=h(9)
  assert.throws(()=>assertSuppressedAnalysis(f.payload,f.expected),/selector binding/)
})

test('CSV requires actual BOM UTF-8 bytes, quoted fields, exact unique ordered 24-column header, CRLF and four rows',()=>{
  const f=fixture(),text=f.bytes.toString('utf8')
  const faults=[f.bytes.subarray(3),Buffer.concat([Buffer.from([0xef,0xbb,0xbf,0xff]),f.bytes.subarray(3)]),
    Buffer.from(text.replaceAll('\r\n','\n')),Buffer.from(text.slice(0,-2)),Buffer.from(text.replace('"participantKind"','participantKind')),
    csv(f.rows,header.slice(1)),csv(f.rows,[...header,'extra']),csv(f.rows,[header[1],header[0],...header.slice(2)]),
    csv(f.rows,[...header.slice(0,-1),'value']),csv(f.rows.slice(1)),csv([...f.rows,f.rows[0]])]
  for (const bytes of faults) assert.throws(()=>assertLongCsv(bytes,f.expected))
  assert.throws(()=>assertLongCsv(text,f.expected),/actual downloaded bytes/)
  assert.throws(()=>assertLongCsv({columns:header,rows:f.rows},f.expected),/actual downloaded bytes/)
  const firstRecordEnd=text.indexOf('\r\n')
  const malformed=Buffer.from(text.slice(0,firstRecordEnd+2)+text.slice(firstRecordEnd+2).replace('"USER",','"USER"junk,'))
  assert.throws(()=>assertLongCsv(malformed,f.expected),/CRLF/)
})

test('CSV rejects zero lost to empty/null and every measured/missingness taxonomy substitution',()=>{
  for (const [index,field,values] of [
    [0,'value',['','0','null']],[0,'reason',['UNANSWERED','NOT_ASSIGNED']],
    [1,'value',['','1','null','0.0','-0']],[1,'reason',['UNANSWERED','NO_OBSERVATION']],
    [2,'value',['0','null']],[2,'reason',['','NO_OBSERVATION','MISSING_SOURCE','UNANSWERED']],
    [3,'value',['0','null']],[3,'reason',['','NOT_ASSIGNED','MISSING_SOURCE','UNANSWERED']],
  ]) for (const value of values) {
    const f=fixture();f.rows[index][field]=value
    assert.throws(()=>assertLongCsv(csv(f.rows),f.expected),undefined,`row ${index} ${field}=${value}`)
  }
})

test('CSV checks each of 24 measured-row fields and rejects duplicate or switched actor/wave cells',()=>{
  for (const field of header) {
    const f=fixture();f.rows[0][field]+='fault'
    assert.throws(()=>assertLongCsv(csv(f.rows),f.expected),undefined,field)
  }
  for (const mutate of [
    f=>{f.rows[3]=structuredClone(f.rows[2])},
    f=>{[f.rows[0].participantKey,f.rows[2].participantKey]=[f.rows[2].participantKey,f.rows[0].participantKey]},
    f=>{f.rows[1].participantKey=f.expected.actors.M},
    f=>{f.rows[3].participantKey=f.rows[0].participantKey},
  ]) {const f=fixture();mutate(f);assert.throws(()=>assertLongCsv(csv(f.rows),f.expected))}
})

test('screened row requires real attempt/provenance and seven empty identity cells; absent row requires empty provenance but dictionary identity',()=>{
  for (const field of ['attemptId','attemptEpoch','originalFinalStatus','taskSatisfied','sourceHashes']) {
    const screened=fixture();screened.rows[2][field]=field==='sourceHashes'?'{}':''
    assert.throws(()=>assertLongCsv(csv(screened.rows),screened.expected),undefined,`screened ${field}`)
    const absent=fixture();absent.rows[3][field]=absent.rows[0][field]
    assert.throws(()=>assertLongCsv(csv(absent.rows),absent.expected),undefined,`absent ${field}`)
  }
  const satisfied=fixture();satisfied.rows[2].taskSatisfied='true'
  assert.throws(()=>assertLongCsv(csv(satisfied.rows),satisfied.expected),/taskSatisfied/)
  for (const field of identityFields) {
    const screened=fixture();screened.rows[2][field]=screened.expected.measurement[field]
    assert.throws(()=>assertLongCsv(csv(screened.rows),screened.expected),undefined,`screened ${field}`)
    const absent=fixture();absent.rows[3][field]=''
    assert.throws(()=>assertLongCsv(csv(absent.rows),absent.expected),undefined,`absent ${field}`)
  }
})

test('CSV cannot accept a stale, changed, or forged manifest/source/measurement identity',()=>{
  for (const mutate of [
    f=>{f.expected.manifest.manifestHash=h(9)},
    f=>{f.expected.manifest.selector.waves[0].taskId=uuid(999)},
    f=>{f.expected.manifest.dictionary[0].columnKey='m_'+h(9)},
    f=>{f.expected.manifest.dictionary[0].measurement.unit='points'},
    f=>{f.expected.manifest.sources[0].sourceHashes={}},
    f=>{f.expected.attempts.MA.attemptEpoch++},
    f=>{f.expected.actors.M=uuid(999)},
    f=>{f.expected.actors.S=f.expected.actors.M},
    f=>{f.expected.analysisPayload.quality.list[0].verdict='EXCLUDE'},
    f=>{f.expected.analysisPayload.analysis.descriptives[0].measurement.version='changed'},
  ]) {const f=fixture();mutate(f);assert.throws(()=>assertLongCsv(f.bytes,f.expected))}
  // Even a consistently rehashed manifest cannot relabel the selected source.
  const f=fixture();f.expected.manifest.sources[0].taskId=uuid(999)
  f.expected.manifest.sourceHash=digest(f.expected.manifest.sources)
  const {manifestHash:_old,...unsigned}=f.expected.manifest
  f.expected.manifest.manifestHash=digest(unsigned)
  f.payload.manifest.sourceHash=f.expected.manifest.sourceHash
  f.payload.manifest.manifestHash=f.expected.manifest.manifestHash
  assert.throws(()=>assertLongCsv(f.bytes,f.expected))
})
