/** Pure preparation checks of the actual continuation config and time helper. */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
const base=path.dirname(new URL(import.meta.url).pathname),backend=path.resolve(base,'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {trainingFlowSchema}=require(path.join(backend,'dist/modules/questionnaire-product/training-flow-authoring.js'))
const {parseTrainingFlowDraft,trainingFlowUnitKey}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
const file=path.join(base,'c20-materials-race-continuation.mjs'),source=fs.readFileSync(file,'utf8')
const expression=source.split('\n').find(line=>line.startsWith(' const config=')).split(' const config=')[1]
const config=vm.runInNewContext('('+expression+')',{unitKey:()=>trainingFlowUnitKey('11111111-1111-4111-8111-111111111111'),formRows:()=>[{}],v1:{}})
trainingFlowSchema.parse({revision:1,config});parseTrainingFlowDraft(config)
const begin=source.indexOf('function boundedTokenExpiry('),end=source.indexOf('\nasync function assertRotated',begin)
const now=Date.now(),scope={assert,Date};vm.createContext(scope);vm.runInContext(source.slice(begin,end)+'\nthis.expiry=boundedTokenExpiry',scope)
const bounds=[]
for(const offset of [61000,120000,3600000]){const end=now+offset,value=scope.expiry({expiresAt:new Date(end).toISOString()});assert.ok(Date.parse(value)>now&&Date.parse(value)<end);bounds.push(offset)}
assert.throws(()=>scope.expiry({expiresAt:new Date(now-1).toISOString()}))
assert.throws(()=>scope.expiry({expiresAt:'not-a-date'}))
assert.ok(!Object.keys(require.cache).some(file=>/[/]dist[/]config[/](database|queue)[.]js$/.test(file)))
console.log(JSON.stringify({passed:true,scope:'PURE_PREPARATION_ONLY',producerSha256:createHash('sha256').update(source).digest('hex'),positiveConfigurations:1,schemaVersion:config.schemaVersion,positiveTokenBoundaryOffsetsMs:bounds,invalidTimeCases:2},null,2))
