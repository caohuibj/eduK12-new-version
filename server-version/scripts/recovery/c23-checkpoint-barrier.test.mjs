/** No services, database, production modules or mocks of business behavior. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {pathsToGate,descendants} from './c23-checkpoint-barrier.mjs'
import {publicFailure,publicPostgresFailure,publicRoute} from './c21-error-redaction.mjs'
const gate={pid:1,blockers:[],wait_event_type:'Client'}
const waiter=(pid,blockers)=>({pid,blockers,wait_event_type:'Lock'})
test('accepts observed direct and chained blockers for both pending participants',()=>{
 const graph=[gate,waiter(2,[1]),waiter(3,[2])]
 assert.deepEqual(descendants(graph,1),[2,3]);assert.deepEqual(pathsToGate(graph,1,[2,3]),[[2,1],[3,2,1]])
})
test('rejects no wait, missing participants, wrong wait kind and cycles',()=>{
 for(const graph of [[gate,waiter(2,[])],[gate],[gate,{...waiter(2,[1]),wait_event_type:'IO'}],[gate,waiter(2,[3]),waiter(3,[2,1])]])assert.equal(pathsToGate(graph,1,[2]),null)
 assert.equal(pathsToGate([gate,waiter(2,[3]),waiter(3,[2,1])],1,[2,3]),null)
})
test('rejects unknown/zero blockers and duplicate participants even beside valid paths',()=>{
 for(const blockers of [[0,1],[99,1]])assert.equal(pathsToGate([gate,waiter(2,blockers)],1,[2]),null)
 assert.equal(pathsToGate([gate,waiter(2,[1])],1,[2,2]),null)
 assert.equal(pathsToGate([gate],1,[]),null)
})
test('public failures and paths never carry SQL rows or recovery token query strings',()=>{
 const secret='SENTINEL_PRIVATE_ROW_TOKEN',error=Object.assign(new Error(secret),{code:'P0001',detail:secret,where:secret})
 assert.equal(JSON.stringify(publicPostgresFailure(error)),JSON.stringify({category:'POSTGRES_TRANSACTION_REJECTED',code:'P0001'}))
 assert.ok(!JSON.stringify(publicFailure(error)).includes(secret))
 assert.equal(publicRoute('/public/composite-assessments/'+secret+'/start?recoveryToken='+secret),'/public/composite-assessments/[token]/start')
})
