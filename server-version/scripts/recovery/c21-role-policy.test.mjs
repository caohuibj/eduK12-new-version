/** No database connection: official validator contract negatives, not PG evidence. */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runtimeTablePolicy,verifyRuntimePrivileges} from '../../backend/scripts/runtime-role-contract.mjs'
const round={name:'training_public_rounds',readable:true,writable:true,read_only:false}
function fixture(rows,restricted=true){let index=0;const outputs=[[{restricted}],[{usable:true}],rows,[]];return {$queryRawUnsafe:async()=>outputs[index++]}}
assert.equal(runtimeTablePolicy.tables.training_public_rounds,'RUNTIME_RW')
assert.equal((await verifyRuntimePrivileges(fixture([round]))).restrictedRuntimeRole,true)
await assert.rejects(verifyRuntimePrivileges(fixture([{...round,name:'unclassified_c21_table'}])),/RUNTIME_PRIVILEGES_INCOMPLETE/)
await assert.rejects(verifyRuntimePrivileges(fixture([{...round,writable:false,read_only:true}])),/RUNTIME_PRIVILEGES_INCOMPLETE/)
await assert.rejects(verifyRuntimePrivileges(fixture([round],false)),/RUNTIME_ROLE_NOT_RESTRICTED/)
const migration=readFileSync(new URL('../../backend/prisma/migrations/20261019040000_training_public_rounds/migration.sql',import.meta.url),'utf8')
assert.ok(migration.includes("IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Training public round identity and window are immutable'"))
console.log('PASS 6 C21 role-policy contract checks; unknown table and unrestricted role remain rejected. Actual PostgreSQL authorization/trigger evidence is a separate phase.')
