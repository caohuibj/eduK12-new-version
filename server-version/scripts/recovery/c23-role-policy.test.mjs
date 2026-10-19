/** No database connection: official validator contract negatives, not PG evidence. */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runtimeTablePolicy,verifyRuntimePrivileges} from '../../backend/scripts/runtime-role-contract.mjs'
const round={name:'training_attempt_checkpoints',readable:true,writable:true,read_only:false}
function fixture(rows,restricted=true){let index=0;const outputs=[[{restricted}],[{usable:true}],rows,[]];return {$queryRawUnsafe:async()=>outputs[index++]}}
assert.equal(runtimeTablePolicy.tables.training_attempt_checkpoints,'RUNTIME_RW')
assert.equal((await verifyRuntimePrivileges(fixture([round]))).restrictedRuntimeRole,true)
await assert.rejects(verifyRuntimePrivileges(fixture([{...round,name:'unclassified_c23_table'}])),/RUNTIME_PRIVILEGES_INCOMPLETE/)
await assert.rejects(verifyRuntimePrivileges(fixture([{...round,writable:false,read_only:true}])),/RUNTIME_PRIVILEGES_INCOMPLETE/)
await assert.rejects(verifyRuntimePrivileges(fixture([round],false)),/RUNTIME_ROLE_NOT_RESTRICTED/)
const migration=readFileSync(new URL('../../backend/prisma/migrations/20261019050000_training_persistence/migration.sql',import.meta.url),'utf8')
assert.ok(migration.includes("Training checkpoint identity and save budget are retained"))
assert.ok(migration.includes('WHERE payload_encrypted IS NOT NULL'))
console.log('PASS C23 role-policy contract; real PG trigger/authorization evidence remains separate.')
