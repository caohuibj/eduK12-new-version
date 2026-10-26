/** Host-only: npx tsx src/__tests__/measurement-content/dot356-standard-vertical-readonly-probe.ts
 * Existing private test env only. No HTTP, no application writes. */
import {writeFile} from 'node:fs/promises'
import {verifyDot356StoredFinal} from './dot356-standard-vertical-storage.fixture'
async function main(){
 const u=new URL(process.env.DATABASE_URL??'invalid:')
 if(process.env.NODE_ENV!=='test'||process.env.DOT356_VERTICAL_READONLY!=='1'||!['127.0.0.1','localhost'].includes(u.hostname)||u.port!=='55439'||u.pathname!=='/eduk12_dot356_vertical_20261025_v2'||u.searchParams.has('host')||u.searchParams.has('schema'))throw new Error('Exact dedicated V2 DB and read-only opt-in required')
 const {prisma}=await import('../../config/database')
 try {
  const safe=await prisma.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
   const stored=await verifyDot356StoredFinal(tx,'3c47c085-0065-4365-aa28-0268e145760f')
   return stored.safe
  },{timeout:30000})
  await writeFile(process.env.DOT356_VERTICAL_OUTPUT??'/tmp/dot356-vertical-readonly.json',JSON.stringify({status:'PASS',...safe},null,2),{mode:0o600})
 }finally{await (await import('../../config/queue')).closeQueues(true);await prisma.$disconnect()}
}
main().catch(error=>{console.error('Read-only vertical verification failed', error?.name, error?.code);console.error(String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).join('\n'));process.exitCode=1})
