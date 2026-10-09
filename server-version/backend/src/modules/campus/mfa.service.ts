import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { getCookie } from '../../utils/authCookies'
import { generateToken } from '../../utils/jwt'
import type { JwtPayload } from '../../types'
import { setSchoolSessionCookie } from '../../utils/authCookies'

const MFA_PENDING_COOKIE = 'huischool_mfa_pending'
const PENDING_MAX_AGE_SECONDS = 300
const TOTP_STEP_SECONDS = 30
const RECOVERY_CODES_COUNT = 10
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const nowStep = () => Math.floor(Date.now()/1000/TOTP_STEP_SECONDS)

function secretKey(): Buffer {
  const hex = process.env.CAMPUS_MFA_ENCRYPTION_KEY
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('CAMPUS_MFA_KEY_NOT_CONFIGURED')
  return Buffer.from(hex, 'hex')
}
function encryptSecret(secret: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv)
  const data = Buffer.concat([cipher.update(secret), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.')
}
function decryptSecret(value: string): Buffer {
  const pieces=value.split('.').map(piece=>Buffer.from(piece,'base64url'))
  if(pieces.length!==3||pieces[0].length!==12||pieces[1].length!==16)throw new Error('CAMPUS_MFA_CIPHER_INVALID')
  const decipher=createDecipheriv('aes-256-gcm',secretKey(),pieces[0])
  decipher.setAuthTag(pieces[1])
  return Buffer.concat([decipher.update(pieces[2]),decipher.final()])
}
export function base32TotpSecret(buffer:Buffer):string {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits=0,acc=0,result=''
  for(const byte of buffer) {
    acc=(acc<<8)|byte;bits+=8
    while(bits>=5){bits-=5;result+=alphabet[(acc>>>bits)&31]}
  }
  if(bits)result+=alphabet[(acc<<(5-bits))&31]
  return result
}
export function totpAt(secret:Buffer,step:number):string {
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step))
  const mac=createHmac('sha1',secret).update(counter).digest()
  const offset=mac[mac.length-1]&15
  return String((mac.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0')
}
function validStep(secret:Buffer,otp:string,lastUsedStep:bigint):number|null {
  if(!/^\d{6}$/.test(otp))return null
  const current=nowStep()
  for(const step of [current-1,current,current+1]) {
    if(BigInt(step)>lastUsedStep && totpAt(secret,step)===otp)return step
  }
  return null
}

// Current DB facts, not legacy User.role in a JWT, determine mandatory MFA.
// Ordinary school teachers and parents are not automatically privileged.
export async function schoolAccountNeedsMfa(userId:string):Promise<boolean> {
  const rows=await prisma.$queryRaw<Array<{required:boolean}>>`
    SELECT (
      u."role"::text='ADMIN' OR u."platform_role"::text='SYSTEM_ADMIN'
      OR EXISTS (
        SELECT 1 FROM "organization_memberships" m JOIN "organizations" o
          ON o."id"=m."organization_id" AND o."status"='ACTIVE'
        WHERE m."user_id"=u."id" AND m."valid_from"<=statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
          AND m."org_role"='ORG_ADMIN'
      )
      OR EXISTS (
        SELECT 1 FROM "organization_capability_grants" c
        JOIN "organization_memberships" m ON m."id"=c."membership_id"
          AND m."valid_from"<=statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
        JOIN "organizations" o ON o."id"=m."organization_id" AND o."status"='ACTIVE'
        WHERE m."user_id"=u."id" AND c."revoked_at" IS NULL
          AND c."capability" IN ('PSYCHOLOGY_STAFF','PARENT_REPORT_DISCLOSURE','REPORT_MEMBER_EXPORT','REPORT_EXPORT')
      )
    ) AS "required"
    FROM "users" u WHERE u."id"=${userId} AND u."account_domain"='SCHOOL'
  `
  return rows[0]?.required??false
}

function pendingCookie(req:Request,res:Response,value:string,maxAge:number) {
  const secure=(req.secure||process.env.NODE_ENV==='production')?'; Secure':''
  res.append('Set-Cookie',`${MFA_PENDING_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`)
}
export function getPendingChallenge(req:Request):string|null {
  return getCookie(req,MFA_PENDING_COOKIE)
}
export function clearPendingChallenge(req:Request,res:Response) {
  pendingCookie(req,res,'',0)
}
export async function beginSchoolMfaChallenge(req:Request,res:Response,userId:string,tokenVersion:number) {
  const raw=randomBytes(32).toString('base64url')
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`
      UPDATE "campus_mfa_challenges" SET "consumed_at"=statement_timestamp()
      WHERE "user_id"=${userId} AND "consumed_at" IS NULL
    `
    await tx.$executeRaw`
      INSERT INTO "campus_mfa_challenges" (
        "id","user_id","challenge_hash","token_version","expires_at"
      ) VALUES (${randomUUID()},${userId},${digest(raw)},${tokenVersion},
                statement_timestamp()+interval '5 minutes')
    `
  })
  pendingCookie(req,res,raw,PENDING_MAX_AGE_SECONDS)
  const state=await prisma.$queryRaw<Array<{ enabled:boolean }>>`
    SELECT "enabled" FROM "campus_mfa_credentials" WHERE "user_id"=${userId}
  `
  return {mfaRequired:true,enrolled:state[0]?.enabled===true}
}

type ChallengeRow={id:string;userId:string;tokenVersion:number;failedCount:number}
async function lockedChallenge(tx:Prisma.TransactionClient,raw:string):Promise<ChallengeRow|null> {
  const rows=await tx.$queryRaw<ChallengeRow[]>`
    SELECT "id","user_id" AS "userId","token_version" AS "tokenVersion",
           "failed_count" AS "failedCount"
    FROM "campus_mfa_challenges" WHERE "challenge_hash"=${digest(raw)}
      AND "consumed_at" IS NULL AND "expires_at">statement_timestamp()
      AND "failed_count"<5
    FOR UPDATE
  `
  return rows[0]??null
}
async function currentChallengeUser(tx:Prisma.TransactionClient,row:ChallengeRow) {
  const users=await tx.$queryRaw<Array<{
    id:string;username:string;role:'STUDENT'|'TEACHER'|'PARENT'|'ADMIN'
    tokenVersion:number;mustChangePassword:boolean
  }>>`
    SELECT "id","username","role"::text AS "role",
      "token_version" AS "tokenVersion","must_change_password" AS "mustChangePassword"
    FROM "users" WHERE "id"=${row.userId} AND "account_domain"='SCHOOL'
      AND "is_active"=TRUE AND "is_frozen"=FALSE
      AND ("expires_at" IS NULL OR "expires_at">statement_timestamp())
    FOR SHARE
  `
  const user=users[0]
  return user && user.tokenVersion===row.tokenVersion ? user : null
}
type MfaRow={secretCipher:string;enabled:boolean;lastUsedStep:bigint}
async function lockedCredential(tx:Prisma.TransactionClient,userId:string):Promise<MfaRow|null> {
  const rows=await tx.$queryRaw<MfaRow[]>`
    SELECT "secret_cipher" AS "secretCipher","enabled",
           "last_used_step" AS "lastUsedStep"
    FROM "campus_mfa_credentials" WHERE "user_id"=${userId} FOR UPDATE
  `
  return rows[0]??null
}
async function issueSchoolFullSession(req:Request,res:Response,user: {
  id:string;username:string;role:JwtPayload['role'];tokenVersion:number;mustChangePassword:boolean
}) {
  const token=generateToken({
    userId:user.id,username:user.username,role:user.role,accountDomain:'SCHOOL',
    tokenVersion:user.tokenVersion,mustChangePassword:user.mustChangePassword,
    mfaVerifiedAt:Math.floor(Date.now()/1000),
  })
  setSchoolSessionCookie(req,res,token)
  clearPendingChallenge(req,res)
}
export async function startSchoolMfaEnrollment(raw:string) {
  const identity=await prisma.$transaction(async tx=>{
    const ch=await lockedChallenge(tx,raw)
    if(!ch||!await currentChallengeUser(tx,ch))return null
    const mfa=await lockedCredential(tx,ch.userId)
    if(mfa?.enabled)return null
    const alias=await tx.campusAccount.findUnique({where:{userId:ch.userId}})
    if(!alias)return null
    const secret=randomBytes(20)
    const cipher=encryptSecret(secret)
    await tx.$executeRaw`
      INSERT INTO "campus_mfa_credentials" ("user_id","secret_cipher","enabled")
      VALUES (${ch.userId},${cipher},FALSE)
      ON CONFLICT ("user_id") DO UPDATE
        SET "secret_cipher"=EXCLUDED."secret_cipher",
            "enabled"=FALSE,"last_used_step"=-1,"updated_at"=statement_timestamp()
      WHERE "campus_mfa_credentials"."enabled"=FALSE
    `
    return { loginName:alias.loginName,secret }
  })
  if(!identity)return null
  const label=encodeURIComponent('Huischool:'+identity.loginName)
  const secret=base32TotpSecret(identity.secret)
  return { otpauthUri:`otpauth://totp/${label}?secret=${secret}&issuer=Huischool&algorithm=SHA1&digits=6&period=30` }
}
export async function completeSchoolMfa(raw:string,otp:string,kind:'VERIFY'|'ENROLL'|'RECOVERY') {
  const recoveryCodes=kind==='ENROLL'?Array.from({length:RECOVERY_CODES_COUNT},()=>randomBytes(18).toString('base64url')):[]
  const result=await prisma.$transaction(async tx=>{
    const challenge=await lockedChallenge(tx,raw)
    if(!challenge)return null
    const user=await currentChallengeUser(tx,challenge)
    const cred=await lockedCredential(tx,challenge.userId)
    if(!user||!cred || (kind==='ENROLL'?cred.enabled:!cred.enabled))return null
    let valid=false
    let step:number|null=null
    if(kind==='RECOVERY'){
      const used=await tx.$queryRaw<Array<{codeHash:string}>>`
        UPDATE "campus_mfa_recovery_codes" SET "used_at"=statement_timestamp()
        WHERE "user_id"=${user.id} AND "code_hash"=${digest(otp)}
          AND "used_at" IS NULL
        RETURNING "code_hash" AS "codeHash"
      `
      valid=used.length===1
    }else{
      step=validStep(decryptSecret(cred.secretCipher),otp,cred.lastUsedStep)
      valid=step!==null
    }
    if(!valid) {
      await tx.$executeRaw`
        UPDATE "campus_mfa_challenges" SET "failed_count"="failed_count"+1
        WHERE "id"=${challenge.id}
      `
      return null
    }
    if(step!==null)await tx.$executeRaw`
      UPDATE "campus_mfa_credentials" SET "last_used_step"=${BigInt(step)},
        "updated_at"=statement_timestamp(),
        "enabled"=TRUE, "enabled_at"=COALESCE("enabled_at",statement_timestamp())
      WHERE "user_id"=${user.id}
    `
    if(kind==='ENROLL') {
      const hashes=recoveryCodes.map(x=>Prisma.sql`(${user.id},${digest(x)})`)
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "campus_mfa_recovery_codes" ("user_id","code_hash")
        VALUES ${Prisma.join(hashes)}
      `)
    }
    await tx.$executeRaw`
      UPDATE "campus_mfa_challenges" SET "consumed_at"=statement_timestamp()
      WHERE "id"=${challenge.id}
    `
    return user
  })
  return result?{user:result,recoveryCodes}:null
}
export async function finishSchoolMfa(req:Request,res:Response,raw:string,otp:string,kind:'VERIFY'|'ENROLL'|'RECOVERY') {
  const result=await completeSchoolMfa(raw,otp,kind)
  if(!result)return null
  await issueSchoolFullSession(req,res,result.user)
  return { authenticated:true, ...(result.recoveryCodes.length?{recoveryCodes:result.recoveryCodes}:{}) }
}
export async function verifySchoolTotpStepUp(userId:string,otp:string):Promise<boolean> {
  return prisma.$transaction(async tx=>{
    const credential=await lockedCredential(tx,userId)
    if(!credential?.enabled)return false
    const step=validStep(decryptSecret(credential.secretCipher),otp,credential.lastUsedStep)
    if(step===null)return false
    await tx.$executeRaw`
      UPDATE "campus_mfa_credentials"
      SET "last_used_step"=${BigInt(step)}, "updated_at"=statement_timestamp()
      WHERE "user_id"=${userId}
    `
    return true
  })
}
