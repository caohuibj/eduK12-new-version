import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
const mocks = vi.hoisted(() => ({ consume: vi.fn(), statfs: vi.fn() }))
vi.mock('../../services/cacheService', () => ({ cacheService: { consumeWeightedRateLimit: mocks.consume } }))
vi.mock('node:fs/promises', () => ({ statfs: mocks.statfs }))
import { assertRemoteVideoCapacity, reserveRemoteVideoBudget, REMOTE_VIDEO_MAX_BYTES } from '../../services/remoteVideoAdmission'
describe('remote video charges remote transfer, fails closed and protects disk', () => {
 beforeEach(() => { vi.restoreAllMocks(); mocks.consume.mockReset(); mocks.statfs.mockResolvedValue({ bavail: 100 * 1024 ** 3, bsize: 1 }) })
 it('charges all three maximum transfers, with a pseudonymous principal', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  mocks.consume.mockResolvedValue({ allowed: true })
  try {
   await reserveRemoteVideoBudget('synthetic-owner')
   expect(mocks.consume).toHaveBeenCalledWith(expect.stringMatching(/^video:url:bytes:[a-f0-9]{64}$/),18*1024**3,900,REMOTE_VIDEO_MAX_BYTES*3)
   expect(mocks.consume).toHaveBeenCalledWith('video:url:bytes:global',72*1024**3,900,REMOTE_VIDEO_MAX_BYTES*3)
   mocks.consume.mockResolvedValueOnce({allowed:true}).mockResolvedValueOnce({allowed:false,retryAfterSeconds:90})
   await expect(reserveRemoteVideoBudget('second-owner')).rejects.toMatchObject({status:503,retryAfterSeconds:90})
   mocks.consume.mockResolvedValue(null)
   await expect(reserveRemoteVideoBudget('synthetic-owner')).rejects.toMatchObject({ status: 503 })
   mocks.consume.mockResolvedValue({ allowed:false,retryAfterSeconds:117 })
   await expect(reserveRemoteVideoBudget('synthetic-owner')).rejects.toMatchObject({ status:429,retryAfterSeconds:117 })
  } finally { vi.unstubAllEnvs() }
 })
 it('rejects absent disk proof and insufficient headroom before admission', async () => {
  const tx = { $executeRaw:vi.fn().mockResolvedValue(0), $queryRaw: vi.fn().mockResolvedValueOnce([{ total:0n,principal:0n }]).mockResolvedValueOnce([{ total:0n,principal:0n }]) }
  mocks.statfs.mockRejectedValue(new Error('unavailable'))
  await expect(assertRemoteVideoCapacity(tx as any,'owner')).rejects.toMatchObject({ status:503 })
  tx.$queryRaw.mockResolvedValueOnce([{ total:0n,principal:0n }]).mockResolvedValueOnce([{ total:0n,principal:0n }])
  mocks.statfs.mockResolvedValue({ bavail:10*1024**3,bsize:1 })
  await expect(assertRemoteVideoCapacity(tx as any,'owner')).rejects.toMatchObject({ status:503 })
 })
 it('includes other pending jobs in the owner storage reservation', async () => {
  const tx = { $executeRaw:vi.fn().mockResolvedValue(0), $queryRaw:vi.fn().mockResolvedValueOnce([{ total:1n,principal:1n }]).mockResolvedValueOnce([{ total:0n,principal:0n }]) }
  await expect(assertRemoteVideoCapacity(tx as any,'owner')).rejects.toMatchObject({ status:429 })
 })
})
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PARENT_PORTAL_TEST_DB_URL')
if(url && !/test|ci/.test(new URL(url).pathname) && process.env.CI!=='true') throw new Error('requires isolated named test database')
const suite=url?describe:describe.skip
suite('remote video admission is atomic in PostgreSQL',()=>{
 let db:PrismaClient
 const schema='security_video_'+randomUUID().replace(/-/g,'')
 beforeAll(async()=>{
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  await db.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"')
  await db.$executeRawUnsafe('CREATE TABLE "'+schema+'".videos (id text PRIMARY KEY,teacher_id text,status text,is_deleted boolean DEFAULT false)')
  await db.$executeRawUnsafe('CREATE TABLE "'+schema+'".stored_assets (owner_id text,size_bytes bigint,deleted_at timestamptz)')
  mocks.statfs.mockResolvedValue({ bavail:100*1024**3,bsize:1 })
 })
 afterAll(async()=>{await db.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE');await db.$disconnect()})
 it('five simultaneous creates cannot overbook four durable reservations',async()=>{
  const result=await Promise.allSettled(Array.from({length:5},(_,n)=>db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET LOCAL search_path TO "'+schema+'"')
   await assertRemoteVideoCapacity(tx,'owner-'+n)
   await tx.$executeRaw`INSERT INTO videos(id,teacher_id,status) VALUES (${'video-'+n},${'owner-'+n},'PENDING')`
  },{timeout:10000})))
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(4)
  expect(result.filter(r=>r.status==='rejected')).toHaveLength(1)
  const rows=await db.$queryRawUnsafe<Array<{count:number}>>('SELECT count(*)::int AS count FROM "'+schema+'".videos')
  expect(rows[0].count).toBe(4)
  await db.$executeRawUnsafe('UPDATE "'+schema+'".videos SET is_deleted=true')
  await expect(db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET LOCAL search_path TO "'+schema+'"')
   await assertRemoteVideoCapacity(tx,'new-owner')
  })).rejects.toMatchObject({status:503})

 })
})
