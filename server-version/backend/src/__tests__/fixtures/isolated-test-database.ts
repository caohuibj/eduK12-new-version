import {randomUUID} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'

/** Tests of a fixed registry identity or a global FIFO need an empty database.
 * Create one on the explicitly selected disposable service, with all actual
 * migrations and immutable protections. Never clone or modify existing data.
 * The owning job disposes the service; local diagnostic databases are retained.
 */
export async function isolatedTestDatabase(names:string[],prefix:string){
 const selected=integrationDatabaseUrl(...names)
 if(!selected)return {url:undefined,restore:async()=>{}}
 requireIsolatedReleaseDatabase(selected)
 if(!/^[a-z_]{1,20}$/.test(prefix))throw new Error('Invalid synthetic database prefix')
 const name=prefix+'_test_'+randomUUID().replaceAll('-',''),url=new URL(selected)
 const admin=new PrismaClient({datasources:{db:{url:selected}}})
 try{await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)}finally{await admin.$disconnect()}
 url.pathname='/'+name
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
 await promisify(execFile)(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',path.join(root,'prisma/schema.prisma')],
  {cwd:root,env:{...process.env,DATABASE_URL:url.href},timeout:45000,maxBuffer:1024*1024})
 const original=new Map(['DATABASE_URL',...names].map(key=>[key,process.env[key]]))
 const shared=globalThis as typeof globalThis&{prisma?:PrismaClient;prismaObservabilityClient?:PrismaClient}
 const previous={prisma:shared.prisma,observed:shared.prismaObservabilityClient}
 const client=new PrismaClient({datasources:{db:{url:url.href}}})
 shared.prisma=client;delete shared.prismaObservabilityClient
 for(const key of original.keys())process.env[key]=url.href
 return {url:url.href,restore:async()=>{
  await client.$disconnect()
  if(previous.prisma===undefined)delete shared.prisma;else shared.prisma=previous.prisma
  if(previous.observed===undefined)delete shared.prismaObservabilityClient;else shared.prismaObservabilityClient=previous.observed
  for(const [key,value] of original){if(value===undefined)delete process.env[key];else process.env[key]=value}
 }}
}
