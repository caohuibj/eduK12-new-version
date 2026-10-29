import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { checkSelectedHistory, checkSelectedSource, readSelectedSource, checkSelectedBundleDependencies, checkSelectedBuiltinDependencies } from './scale-intake-selected-check'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const file = 'server-version/backend/src/modules/scale/instruments/academic_self_concept_biology_zh_cn/1.0.0/instrument.ts'
const source = () => JSON.parse(readFileSync(resolve(repo, file.replace('instrument.ts', 'source.json')), 'utf8'))
test('existing published JSON pair: golden and report consume each scoring result once', async () => {
 const value = await readSelectedSource(file, p => readFileSync(resolve(repo,p),'utf8'))
 const result = checkSelectedSource(value)
 assert.equal(result.status,'PUBLISHED'); assert.equal(result.goldenCases,3); assert.equal(result.scoringExecutions,6)
})
test('inline declaration retains schema and path checks', async () => {
 const value = await readSelectedSource(file, () => `export const SCALE_INSTRUMENT_SOURCE = ${JSON.stringify(source())} as const`)
 assert.deepEqual(value.identity,source().identity)
 const bad=source();bad.identity.instrumentVersion='2.0.0'
 await assert.rejects(readSelectedSource(file, () => `export const SCALE_INSTRUMENT_SOURCE = ${JSON.stringify(bad)}`),/VERSION_PATH/)
})
test('runtime calls and unsupported runtime imports rejected before execution', async () => {
 await assert.rejects(readSelectedSource(file, () => 'export const SCALE_INSTRUMENT_SOURCE = fetch("https://example.com")'),/UNSAFE_DECLARATION/)
 await assert.rejects(readSelectedSource(file, () => 'import source from "./other.json"; export const SCALE_INSTRUMENT_SOURCE = source'),/UNSUPPORTED_CONTENT_IMPORT/)
})
test('wrong golden score fails without validator rescoring', () => {
 const value=source(),scores=value.executable.goldenCases[0].expected.scores;scores[Object.keys(scores)[0]]+=1
 assert.throws(()=>checkSelectedSource(value),/AssertionError/)
})
test('DRAFT is not a same-version measurement replacement exemption', () => {
 const old=source(),next=source();old.executable.releaseStatus='DRAFT';next.executable.releaseStatus='DRAFT'
 next.executable.definition.items[0].content+=' changed'
 assert.throws(()=>checkSelectedHistory(old,next),/MEASUREMENT_CHANGED_WITHOUT_NEW_C_VERSION/)
})
test('versioned R-only revision retains C; unversioned R rewrite fails', () => {
 const old=source(),next=source();next.executable.definition.report.disclaimer+=' revised'
 assert.throws(()=>checkSelectedHistory(old,next),/REPORT_VERSION_CONFLICT/)
 next.executable.definition.report.reportVersion='99.0.0'
 assert.doesNotThrow(()=>checkSelectedHistory(old,next))
})
test('same-P payload rewrite fails, independently revised P binding retains C', () => {
 const old=source(),next=source();next.executable.references[0].description='changed'
 assert.throws(()=>checkSelectedHistory(old,next),/REFERENCE_VERSION_CONTENT_CONFLICT/)
 const revised=source(),prior=revised.executable.references[0].referenceVersion
 revised.executable.references[0].referenceVersion='new-parameter-version'
 for(const row of revised.executable.definition.referencePolicy.selections)if(row.referenceVersion===prior)row.referenceVersion='new-parameter-version'
 for(const row of revised.executable.definition.report.interpretations)if(row.source.referenceVersion===prior)row.source.referenceVersion='new-parameter-version'
 revised.executable.definition.report.reportVersion='99.0.0'
 assert.doesNotThrow(()=>checkSelectedHistory(old,revised))
})
test('per-score missing-policy overrides include proration and noncanonical scores', () => {
 const value=source(),e=value.executable,d=e.definition
 d.referencePolicy={type:'none'};e.references=[]
 for(const row of d.report.interpretations)row.source={type:'score_only'}
 e.goldenCases=e.goldenCases.filter((f:any)=>f.expected.quality==='interpretable')
 d.scoring.scores[0].missingPolicy={type:'prorate_if_min_answered',minimumAnswered:2}
 assert.equal(checkSelectedSource(value).referencePolicy,'none')
 const extra=structuredClone(d.scoring.scores[0]);extra.key='noncanonical';extra.canonical=false;extra.missingPolicy={type:'allow_missing_without_proration'};d.scoring.scores.push(extra);d.report.scoreOrder.push('noncanonical');d.report.interpretations.push({...structuredClone(d.report.interpretations[0]),scoreKey:'noncanonical'})
 for(const f of e.goldenCases){f.expected.totalScoreKeys.push('noncanonical');f.expected.scores.noncanonical=f.expected.scores[d.scoring.scores[0].key]}
 assert.doesNotThrow(()=>checkSelectedSource(value))
})

test('only exact selected bundle SCALE slots receive static selector/type/unit checks', () => {
 const value=source(),key=value.executable.definition.scoring.scores[0].key
 const pack={manifest:{definition:{bundleKey:'test',bundleVersion:'1.0.0',slots:[{slotKey:'scale',unitType:'SCALE',...value.identity,valueSelectors:[key]}]}},evidence:[{slotKey:'scale',evidenceKey:'score',selector:key,valueType:'number',unit:'points'}]}
 assert.deepEqual(checkSelectedBundleDependencies([value],[pack]),['test@1.0.0:scale'])
 pack.evidence[0].unit='percent';assert.throws(()=>checkSelectedBundleDependencies([value],[pack]),/BUNDLE_SCALE_SELECTOR_TYPE_UNIT/)
 pack.manifest.definition.slots[0].instrumentVersion='other';assert.deepEqual(checkSelectedBundleDependencies([value],[pack]),[])
})

test('builtin static SCALE slots cover literals, local observer factory and unresolved dependencies', () => {
 const value=source(),key=value.executable.definition.scoring.scores[0].key
 const identity=`instrumentKey: '${value.identity.instrumentKey}', instrumentVersion: '${value.identity.instrumentVersion}'`
 const literal=`export const bundle = wrap({slots: [{unitType: 'SCALE', ${identity}, valueSelectors: ['${key}']}]})`
 assert.equal(checkSelectedBuiltinDependencies([value],{'literal.ts':literal}).length,1)
 assert.throws(()=>checkSelectedBuiltinDependencies([value],{'literal.ts':literal.replace(`['${key}']`,"['unknown']")}),/BUILTIN_SCALE_SELECTOR/)
 const factory=`const observer = (input: Input) => wrap({slots:[{unitType:'SCALE',instrumentKey:input.instrumentKey,instrumentVersion:'1.0.0',valueSelectors:input.valueSelectors}]}); export const one=observer({instrumentKey:'${value.identity.instrumentKey}',valueSelectors:['${key}']})`
 assert.equal(checkSelectedBuiltinDependencies([value],{'factory.ts':factory}).length,1)
 assert.throws(()=>checkSelectedBuiltinDependencies([value],{'dynamic.ts':factory.replace(`['${key}']`,'unknownSelectors')}),/STATIC_UNRESOLVED/)
 assert.throws(()=>checkSelectedBuiltinDependencies([value],{'dynamic.ts':literal.replace('slots: [','slots: [other,')}),/STATIC_UNRESOLVED/)
 assert.deepEqual(checkSelectedBuiltinDependencies([value],{'other.ts':literal.replace(value.identity.instrumentVersion,'99.0.0')}),[])
})

test('same-axis source snapshot rejects unversioned catalog description rewrite', () => {
 const old=source(),next=source()
 next.catalog.construct.constructDefinition+=' clarified'
 assert.throws(()=>checkSelectedHistory(old,next),/SCALE_AXIS_VERSION_CONTENT_CONFLICT/)
})
test('catalog axis revision permits source clarification without changing C P or R', () => {
 const old=source(),next=source()
 next.catalog.construct.constructDefinition+=' clarified'
 next.catalog.catalogManifestVersion+=1
 assert.doesNotThrow(()=>checkSelectedHistory(old,next))
 assert.deepEqual(next.executable,old.executable)
 assert.deepEqual(next.identity,old.identity)
})
