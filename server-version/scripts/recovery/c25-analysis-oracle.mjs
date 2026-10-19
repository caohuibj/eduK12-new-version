/** C25's missing C19 checks, intentionally inert and service-free.
 * Only node built-ins are imported; neither product tables nor its CSV/scoring
 * helpers may supply the expected result. The 1/0 oracle comes from the pinned
 * mixed-scale-item-1 yes/no identity-transform, weight-1 sum fixture.
 *
 * assertSuppressedAnalysis(payload, {selector, measurement}) takes the actual
 * HTTP data object after the client has checked status/code, not a fabricated
 * HTTP envelope. Privacy assertions apply only to payload.analysis; the teacher
 * manifest counts and quality list are legitimate separate response fields.
 *
 * assertLongCsv(downloadedBytes, {selector, measurement, actors, attempts,
 *   manifest, analysisPayload}) takes bytes from the actual artifact download.
 * actors = {M: rawUserId, S: rawUserId}; attempts = {MA, MB, SA}, each containing
 * {attemptId, attemptEpoch}. manifest is the actual new batch's frozen manifest,
 * never a regenerated direct-service result; analysisPayload is the HTTP data.
 * measurement has the seven frozen identity fields below, read from accepted
 * canonical metadata or the server-owned manifest. Identity consistency is not
 * claimed as an independent scoring implementation.
 *
 * References: training-analysis/{core,source,manifest}.ts; response.ts;
 * assessment-runtime/compiler.ts:140-147 and unit-result.ts:265-269;
 * __tests__/questionnaire/product-fixtures.ts:8-35. This proves paired N=1
 * suppression and the four-cell missingness contract, not an N=4/5 boundary.
 */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

const IDENTITY = Object.freeze(['instrumentKey','scoreKey','scoringDigest','responseSignature','respondentType','unit','version'])
const HEADER = Object.freeze(['participantKind','participantKey','waveKey','taskId','publication','configDigest','variantKey','itemId','metricKey','columnKey','attemptId','attemptEpoch','originalFinalStatus','taskSatisfied','sourceHashes',...IDENTITY,'value','reason'])
const REASONS = Object.freeze(['QUALITY_EXCLUDED','NOT_COMPARABLE','NOT_ASSIGNED','UNANSWERED','NON_FINAL','NOT_ATTEMPTED','INVALID_VALUE','MISSING_SOURCE','LEGACY_UNSCOPED','IDENTITY_UNAVAILABLE','NO_OBSERVATION','NOT_CALCULABLE'])
const LIMITATIONS = Object.freeze(['DESCRIPTIVE_RESEARCH_ONLY','NO_CAUSAL_OR_DIAGNOSTIC_INTERPRETATION','UNIQUE_OR_REJECT','NO_CROSS_STRATUM_POOLING'])
const HASH_FIELDS = Object.freeze(['manifestHash','definitionHash','sourceHash','qualityHash','authorityHash'])
const record = (value, label) => assert.ok(value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value)), `${label}: plain object required`)
const nonempty = (value, label) => assert.ok(typeof value === 'string' && value.trim().length, `${label}: nonempty string required`)
const hash = (value, label) => assert.match(value, /^[a-f0-9]{64}$/, `${label}: SHA-256 required`)
const exactKeys = (value, keys, label) => {record(value,label);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),`${label}: unexpected or missing fields`)}
const list = (value, length, label) => {assert.ok(Array.isArray(value),`${label}: array required`);assert.equal(value.length,length,`${label}: exact length`)}
const iso = (value, label) => {nonempty(value,label);assert.equal(new Date(value).toISOString(),value,`${label}: canonical timestamp`)}

// Small independent canonical encoder, for immutable manifest/identity binding.
// No application module (including canonical.ts) is imported.
const canonical = value => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {assert.ok(Number.isFinite(value),'canonical number must be finite');return JSON.stringify(value)}
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']'
  record(value,'canonical value')
  assert.equal(Object.getOwnPropertySymbols(value).length,0,'canonical symbols forbidden')
  // Object enumeration after insertion also preserves JSON integer-key order.
  const sorted = Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]]))
  return '{'+Object.keys(sorted).map(key=>JSON.stringify(key)+':'+canonical(sorted[key])).join(',')+'}'
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
const measurementCheck = (value, expected, label) => {
  exactKeys(value,IDENTITY,label)
  for (const key of IDENTITY) nonempty(value[key],`${label}.${key}`)
  assert.equal(value.unit,'score',`${label}.unit: compiled Scale unit`)
  assert.equal(value.scoreKey,'total',`${label}.scoreKey`)
  if (expected) assert.deepEqual(value,expected,`${label}: frozen seven-field identity mismatch`)
}
const scope = wave => ({waveKey:wave.waveKey,taskId:wave.taskId,publication:wave.publication,configDigest:null,variantKey:null,itemId:wave.metrics[0].itemId,metricKey:'total'})
const columnKey = wave => 'm_'+digest({waveKey:wave.waveKey,scope:JSON.stringify([wave.taskId,wave.publication,null,null]),itemId:wave.metrics[0].itemId,metricKey:'total'})
function selected(expected) {
  record(expected,'expected')
  const selector=expected.selector
  exactKeys(selector,['schemaVersion','courseId','mode','waves'],'expected.selector')
  assert.equal(selector.schemaVersion,1);assert.equal(selector.mode,'PAIRWISE');nonempty(selector.courseId,'selector.courseId')
  list(selector.waves,2,'selector.waves')
  for (const [index,wave] of selector.waves.entries()) {
    exactKeys(wave,['waveKey','taskId','publication','configDigest','variantKey','metrics'],`selector.waves[${index}]`)
    assert.equal(wave.waveKey,index===0?'wave_a':'wave_b','fixed wave order')
    nonempty(wave.taskId,'wave.taskId');iso(wave.publication,'wave.publication')
    assert.equal(wave.configDigest,null);assert.equal(wave.variantKey,null)
    list(wave.metrics,1,'wave.metrics');exactKeys(wave.metrics[0],['itemId','metricKey'],'wave.metric')
    nonempty(wave.metrics[0].itemId,'metric.itemId');assert.equal(wave.metrics[0].metricKey,'total')
  }
  assert.notEqual(selector.waves[0].taskId,selector.waves[1].taskId,'two actual publication tasks required')
  assert.notEqual(selector.waves[0].metrics[0].itemId,selector.waves[1].metrics[0].itemId,'two actual publication items required')
  measurementCheck(expected.measurement,null,'expected.measurement')
  return selector
}

export function assertSuppressedAnalysis(payload, expected) {
  const selector=selected(expected)
  record(payload,'HTTP data');record(payload.manifest,'HTTP manifest');record(payload.quality,'HTTP quality')
  const summary=payload.manifest
  exactKeys(summary,['schemaVersion',...HASH_FIELDS,'sourceCutoff','sourceCount','observationCount'],'HTTP manifest summary')
  assert.equal(summary.schemaVersion,1)
  for (const key of HASH_FIELDS) hash(summary[key],`manifest.${key}`)
  assert.equal(summary.definitionHash,digest(selector),'HTTP manifest selector binding')
  iso(summary.sourceCutoff,'manifest.sourceCutoff')
  assert.equal(summary.sourceCount,3,'three actual attempt sources, not publications or dense rows')
  assert.equal(summary.observationCount,3,'three source observations, not four dense CSV cells')
  // No ban on manifest counts or teacher quality counts/list. They are outside
  // the statistical projection and are not claimed to be suppressed.
  assert.ok(Array.isArray(payload.quality.list),'HTTP quality.list is legitimate')
  assert.equal(payload.quality.total,3,'teacher quality source total')
  const analysis=payload.analysis
  exactKeys(analysis,['schemaVersion','kind','courseId','mode','minimumN','state','descriptives','metrics','limitations'],'analysis')
  assert.equal(analysis.schemaVersion,1);assert.equal(analysis.kind,'TRAINING_NUMERIC_LONGITUDINAL')
  assert.equal(analysis.courseId,selector.courseId);assert.equal(analysis.mode,'PAIRWISE')
  assert.equal(analysis.minimumN,5);assert.equal(analysis.state,'suppressed')
  assert.deepEqual(analysis.limitations,LIMITATIONS,'analysis limitations')
  list(analysis.descriptives,2,'analysis.descriptives')
  const seen=new Set()
  for (const descriptive of analysis.descriptives) {
    exactKeys(descriptive,[...Object.keys(scope(selector.waves[0])),'measurement','state'],'suppressed descriptive')
    const wave=selector.waves.find(candidate=>candidate.waveKey===descriptive.waveKey)
    assert.ok(wave,'descriptive must match a selected wave');assert.ok(!seen.has(wave.waveKey),'duplicate descriptive');seen.add(wave.waveKey)
    for (const [key,value] of Object.entries(scope(wave))) assert.equal(descriptive[key],value,`descriptive.${key}`)
    assert.equal(descriptive.state,'suppressed')
    measurementCheck(descriptive.measurement,expected.measurement,`descriptive.${wave.waveKey}.measurement`)
  }
  list(analysis.metrics,1,'analysis.metrics')
  const metric=analysis.metrics[0]
  exactKeys(metric,['metricKey','state','countKind','flow'],'suppressed paired metric')
  assert.equal(metric.metricKey,'total');assert.equal(metric.state,'suppressed','not_comparable is not a small-cohort suppression proof')
  assert.equal(metric.countKind,'PAIRED_VALID')
  list(metric.flow,1,'metric.flow')
  assert.deepEqual(metric.flow[0],{fromWaveKey:'wave_a',toWaveKey:'wave_b',basis:'OBSERVED_SAMPLE',state:'suppressed'},'observed-sample flow must not expose counts')
  return {state:'suppressed',minimumN:5,descriptiveCount:2,metricCount:1,sourceCount:3,observationCount:3,manifestHash:summary.manifestHash}
}

function frozenSources(expected, selector) {
  const {manifest,analysisPayload,actors,attempts}=expected
  assertSuppressedAnalysis(analysisPayload,expected)
  exactKeys(manifest,['schemaVersion','kind','courseId','actor','selector',...HASH_FIELDS,'sourceCutoff','sources','dictionary','observationCount'],'frozen manifest')
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.kind,'TRAINING_ANALYSIS');assert.equal(manifest.courseId,selector.courseId)
  exactKeys(manifest.actor,['id','role'],'manifest.actor');nonempty(manifest.actor.id,'manifest.actor.id');assert.equal(manifest.actor.role,'TEACHER')
  assert.deepEqual(manifest.selector,selector,'frozen selector mismatch')
  for (const key of HASH_FIELDS) hash(manifest[key],`frozen manifest.${key}`)
  const {manifestHash,...unsigned}=manifest
  assert.equal(manifestHash,digest(unsigned),'full frozen manifest digest')
  assert.equal(manifest.definitionHash,digest(selector),'frozen definition digest')
  assert.equal(manifest.sourceHash,digest(manifest.sources),'frozen source digest')
  for (const key of ['schemaVersion',...HASH_FIELDS,'sourceCutoff','observationCount']) assert.deepEqual(manifest[key],analysisPayload.manifest[key],`HTTP/frozen manifest.${key}`)
  list(manifest.sources,3,'manifest.sources');list(manifest.dictionary,2,'manifest.dictionary')
  assert.equal(manifest.observationCount,3)
  for (const wave of selector.waves) {
    const matches=manifest.dictionary.filter(column=>column.waveKey===wave.waveKey)
    list(matches,1,'dictionary wave')
    const column=matches[0]
    exactKeys(column,[...Object.keys(scope(wave)),'columnKey','measurement','valueType','missingReasons'],'dictionary column')
    for (const [key,value] of Object.entries(scope(wave))) assert.equal(column[key],value,`dictionary.${key}`)
    assert.equal(column.columnKey,columnKey(wave),'independent dictionary column identity')
    assert.equal(column.valueType,'NUMBER');assert.deepEqual(column.missingReasons,REASONS)
    measurementCheck(column.measurement,expected.measurement,'dictionary.measurement')
  }
  exactKeys(actors,['M','S'],'actors');for (const name of ['M','S']) nonempty(actors[name],`actors.${name}`)
  assert.notEqual(actors.M,actors.S,'M and S must be distinct actors')
  exactKeys(attempts,['MA','MB','SA'],'attempts')
  const sourceByCase={}
  for (const [name,wave,actor,satisfied,value,reason] of [
    ['MA',selector.waves[0],'M',true,1,null],['MB',selector.waves[1],'M',true,0,null],['SA',selector.waves[0],'S',false,null,'NOT_ASSIGNED'],
  ]) {
    const attempt=attempts[name]
    exactKeys(attempt,['attemptId','attemptEpoch'],`attempts.${name}`);nonempty(attempt.attemptId,`attempts.${name}.attemptId`)
    assert.ok(Number.isSafeInteger(attempt.attemptEpoch)&&attempt.attemptEpoch>0,`attempts.${name}.attemptEpoch`)
    const matches=manifest.sources.filter(source=>source.attemptId===attempt.attemptId)
    list(matches,1,`manifest source ${name}`)
    const source=matches[0]
    exactKeys(source,['waveKey','taskId','attemptId','attemptEpoch','sourceHash','sourceHashes','status','taskSatisfaction'],`manifest source ${name}`)
    assert.equal(source.waveKey,wave.waveKey);assert.equal(source.taskId,wave.taskId);assert.equal(source.attemptEpoch,attempt.attemptEpoch)
    assert.equal(source.status,'COMPLETED');assert.equal(source.taskSatisfaction,satisfied?'SATISFIED':'NOT_SATISFIED')
    record(source.sourceHashes,`${name}.sourceHashes`);assert.ok(Object.keys(source.sourceHashes).length>0,`${name}: observed source hashes required`)
    for (const [key,value] of Object.entries(source.sourceHashes)) {nonempty(key,'sourceHashes key');hash(value,`sourceHashes.${key}`)}
    hash(source.sourceHash,`${name}.sourceHash`);assert.equal(source.sourceHashes.sourceHash,source.sourceHash)
    const participant={participantKind:'USER',participantKey:`user:${actors[actor]}`}
    assert.equal(source.sourceHashes.participant,digest(participant),`${name}: actor source identity`)
    assert.equal(source.sourceHashes.publication,digest({taskId:wave.taskId,publication:wave.publication,configDigest:null,variantKey:null}),`${name}: publication source identity`)
    hash(source.sourceHashes.parent,`${name}.sourceHashes.parent`)
    const {sourceHash:_self,...sourceHashes}=source.sourceHashes
    assert.equal(source.sourceHash,digest({sourceHashes,observations:[{metricKey:'total',itemId:wave.metrics[0].itemId,measurement:reason===null?expected.measurement:null,value,reason}]}),`${name}: frozen source observation/value/reason binding`)
    sourceByCase[name]=source
  }
  assert.equal(new Set(Object.values(attempts).map(attempt=>attempt.attemptId)).size,3,'three distinct attempts required')
  assert.equal(analysisPayload.quality.list.length,3,'quality list must bind all three sources')
  const quality=analysisPayload.quality.list
  assert.equal(manifest.qualityHash,digest(quality),'HTTP quality/full manifest binding')
  for (const source of manifest.sources) {
    const matches=quality.filter(row=>row.attemptId===source.attemptId)
    list(matches,1,'quality attempt')
    assert.deepEqual(matches[0],{attemptId:source.attemptId,attemptEpoch:source.attemptEpoch,sourceHash:source.sourceHash,status:'COMPLETED',taskSatisfaction:source.taskSatisfaction,verdict:'INCLUDE',reason:null,revision:0},'fresh source quality must not replace valid values')
  }
  return sourceByCase
}

function parseDownloadedCsv(bytes) {
  assert.ok(bytes instanceof Uint8Array,'actual downloaded bytes required, not a text/table object')
  assert.ok(bytes.length>3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf,'UTF-8 BOM required')
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes.subarray(3))
  const rows=[];let offset=0
  while (offset<text.length) {
    const row=[]
    while (true) {
      assert.equal(text[offset++],'"','CSV every field must be quoted')
      let value='',closed=false
      while (offset<text.length) {
        const character=text[offset++]
        if (character!=='"') {value+=character;continue}
        if (text[offset]==='"') {value+='"';offset++;continue}
        closed=true;break
      }
      assert.ok(closed,'CSV unterminated quoted field');row.push(value)
      if (text[offset]===',') {offset++;continue}
      assert.equal(text.slice(offset,offset+2),'\r\n','CSV records require CRLF including final record')
      offset+=2;break
    }
    rows.push(row)
  }
  list(rows,5,'CSV header plus four data rows')
  assert.equal(new Set(rows[0]).size,24,'CSV unique 24-column header')
  assert.deepEqual(rows[0],HEADER,'CSV exact ordered header')
  return rows.slice(1).map((row,index)=>{list(row,24,`CSV row ${index+1}`);return Object.fromEntries(HEADER.map((key,column)=>[key,row[column]]))})
}

export function assertLongCsv(bytes, expected) {
  const selector=selected(expected),sources=frozenSources(expected,selector),rows=parseDownloadedCsv(bytes)
  const pseudonyms=Object.fromEntries(['M','S'].map(actor=>[actor,'p_'+digest({schemaVersion:1,courseId:selector.courseId,participantKind:'USER',participantKey:`user:${expected.actors[actor]}`}).slice(0,32)]))
  assert.notEqual(pseudonyms.M,pseudonyms.S)
  const expectedRows=new Map()
  for (const [actor,wave,caseKey,value,reason,hasMeasurement] of [
    ['M',selector.waves[0],'MA','1','',true],['M',selector.waves[1],'MB','0','',true],
    ['S',selector.waves[0],'SA','','NOT_ASSIGNED',false],['S',selector.waves[1],null,'','NO_OBSERVATION',true],
  ]) {
    const source=caseKey?sources[caseKey]:null
    const row={participantKind:'USER',participantKey:pseudonyms[actor],...scope(wave),configDigest:'',variantKey:'',columnKey:columnKey(wave),
      attemptId:source?.attemptId??'',attemptEpoch:source?String(source.attemptEpoch):'',originalFinalStatus:source?.status??'',
      taskSatisfied:source?String(source.taskSatisfaction==='SATISFIED'):'',sourceHashes:source?canonical(source.sourceHashes):'{}',
      ...Object.fromEntries(IDENTITY.map(key=>[key,hasMeasurement?expected.measurement[key]:''])),value,reason}
    expectedRows.set(JSON.stringify([row.participantKey,row.waveKey]),row)
  }
  const seen=new Set()
  for (const row of rows) {
    const key=JSON.stringify([row.participantKey,row.waveKey]),wanted=expectedRows.get(key)
    assert.ok(wanted,'CSV unknown actor pseudonym/wave cell');assert.ok(!seen.has(key),'CSV duplicate actor/wave cell');seen.add(key)
    for (const field of HEADER) assert.equal(row[field],wanted[field],`CSV ${row.waveKey}/${row.participantKey} ${field}`)
  }
  assert.equal(seen.size,4,'CSV must contain every actor/wave cell exactly once')
  return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,rowCount:4,columnCount:24,pairedValidN:1,
    measuredValues:{MA:1,MB:0},missingReasons:{SA:'NOT_ASSIGNED',SB:'NO_OBSERVATION'},scope:'PAIRED_N_1_ONLY'}
}
