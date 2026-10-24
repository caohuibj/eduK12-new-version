import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto'
import {prisma} from '../../config/database'
import {authorizedProject} from './builder.service'
import {ResearchIdentityError,createLinkedResearchIdentity} from './identity.service'
import {normalizeShortCode,validShortCode,parseMemorableCode,memorableCredential,codeCredentialHash,resetCodeHash,normalizeGeneratedCode,generatedCodeLookup} from './memorable-code.crypto'
function fail(status:number,message='研究编码无效或暂不可用'):never{throw new ResearchIdentityError(status,message)}
const ensureEnabled=()=>{if(process.env.SURVEY_WORKSPACE_ENABLED!=='true'||process.env.SURVEY_PUBLICATION_ENABLED!=='true')fail(404)}
export async function readParticipationSettings(actorId:string,projectId:string,page=1){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,projectId,false)
    const project=await tx.surveyProject.findUniqueOrThrow({where:{id:projectId}})
    const rows=await tx.surveyParticipantCode.findMany({where:{projectId},orderBy:{prefix:'asc'},skip:(page-1)*100,take:101,
      select:{prefix:true,participantId:true,resetExpiresAt:true,participant:{select:{researchCode:true,status:true}}}})
    const visibleRows=project.participantIdentityMode==='SELF_CODE'?[]:rows
    const locked=!!project.firstPublishedAt||project.status!=='DRAFT'
    const shortCodes=locked?undefined:(await tx.surveyParticipantCode.findMany({where:{projectId},orderBy:{prefix:'asc'},select:{prefix:true}})).map(row=>row.prefix)
    return {projectId,revision:project.revision,mode:project.participantIdentityMode,label:project.participantCodeLabel,instructions:project.participantCodeInstructions,
      locked,shortCodes,page,hasNext:rows.length>100,participants:visibleRows.slice(0,100)}
  })
}
export async function configureParticipation(actorId:string,projectId:string,input:{revision:number;mode:'PERSONAL_LINK'|'MEMORABLE_CODE'|'SELF_CODE';label:string;instructions:string;shortCodes:string[]}){
  const codes=input.shortCodes.map(normalizeShortCode)
  if(codes.length>5000||codes.some(code=>!validShortCode(code))||new Set(codes).size!==codes.length||input.mode==='MEMORABLE_CODE'&&!codes.length)
    fail(400,'请提供不重复的短编号，每个1–20位，可用数字、字母或汉字；最多5000个。')
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${projectId} AND owner_user_id=${actorId} FOR UPDATE`
    await authorizedProject(tx,actorId,projectId,true)
    const p=await tx.surveyProject.findUniqueOrThrow({where:{id:projectId}})
    if(p.status!=='DRAFT'||p.firstPublishedAt||p.revision!==input.revision)fail(409,'研究已冻结发布或设置已变化，不能切换参与方式。')
    if(p.collectionMode!=='LINKED_WAVES')fail(400,'仅多波次研究可设置参与方式。')
    await tx.surveyParticipantCode.deleteMany({where:{projectId,participantId:null}})
    if(input.mode==='MEMORABLE_CODE')await tx.surveyParticipantCode.createMany({data:codes.map(prefix=>({id:randomUUID(),projectId,prefix}))})
    await tx.surveyProject.update({where:{id:projectId},data:{participantIdentityMode:input.mode,participantCodeLabel:input.label,
      participantCodeInstructions:input.instructions,revision:{increment:1}}})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actorId,projectId,action:'PARTICIPATION_MODE_CONFIGURED',metadata:{mode:input.mode,codeCount:codes.length}}})
  })
  return readParticipationSettings(actorId,projectId)
}
async function codeProject(publicId:string,expected?:'MEMORABLE_CODE'|'SELF_CODE'){
  ensureEnabled()
  const p=await prisma.surveyProject.findUnique({where:{publicId}})
  if(!p||p.collectionMode!=='LINKED_WAVES'||!['MEMORABLE_CODE','SELF_CODE'].includes(p.participantIdentityMode)||(expected&&p.participantIdentityMode!==expected))fail(403)
  return p!
}
export async function joinMemorableStudy(input:{publicId:string;waveId:string;entryToken:string;consent:boolean;consentVersion:number;prefix:string;suffix:string}){
  const p=await codeProject(input.publicId,'MEMORABLE_CODE'),prefix=normalizeShortCode(input.prefix),suffix=input.suffix.normalize('NFKC').trim().toUpperCase()
  if(!validShortCode(prefix)||!/^[A-Z0-9]{4,12}$/.test(suffix))fail(400,'请核对编号，并设置4–12位字母或数字后缀。')
  return createLinkedResearchIdentity({...input,projectId:p.id,memorable:{prefix,suffix}})
}
/** Returned opaque proof is tab-memory only, reused by all existing task/FINAL fences. */
export async function recoverMemorableIdentity(publicId:string,value:string){
  const p=await codeProject(publicId)
  const self=p.participantIdentityMode==='SELF_CODE'?normalizeGeneratedCode(value):null
  const parsed=p.participantIdentityMode==='SELF_CODE'?(self?{prefix:generatedCodeLookup(p.id,self),suffix:self}:null):parseMemorableCode(value)
  if(!parsed)fail(403)
  const row=await prisma.surveyParticipantCode.findUnique({where:{projectId_prefix:{projectId:p.id,prefix:parsed!.prefix}},include:{participant:true}})
  // Derive even for an unknown registry row to avoid a cheap prefix oracle.
  const secret=await memorableCredential(p.id,parsed!.prefix,parsed!.suffix,row?.credentialVersion??0)
  if(!row?.participant||row.resetHash||!['ACTIVE','REVOKED'].includes(row.participant.status)||
    !timingSafeEqual(Buffer.from(row.participant.credentialHash),Buffer.from(codeCredentialHash(secret))))fail(403)
  return {researchCode:row.participant.researchCode,accessCredential:secret,revoked:row.participant.status==='REVOKED'}
}
export async function resetMemorableIdentity(actorId:string,projectId:string,prefixValue:string){
  const prefix=normalizeShortCode(prefixValue)
  if(!validShortCode(prefix))fail(400)
  const token=randomBytes(8).toString('hex').toUpperCase().slice(0,10),resetCode=prefix+'-'+token
  const expiresAt=new Date(Date.now()+30*60*1000)
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${projectId} AND owner_user_id=${actorId} FOR UPDATE`
    await authorizedProject(tx,actorId,projectId,true)
    const p=await tx.surveyProject.findUniqueOrThrow({where:{id:projectId}})
    if(p.participantIdentityMode!=='MEMORABLE_CODE')fail(409)
    const row=await tx.surveyParticipantCode.findUnique({where:{projectId_prefix:{projectId,prefix}},include:{participant:true}})
    if(!row?.participant||row.participant.status!=='ACTIVE')fail(404,'找不到可重置的已参加编号。')
    if(row.resetHash&&row.resetExpiresAt&&row.resetExpiresAt>new Date())fail(409,'该编号已有待使用的重置码，请等待使用或到期后再重置。')
    await tx.surveyParticipantCode.update({where:{id:row.id},data:{credentialVersion:{increment:row.resetHash?0:1},previousCredentialHash:row.previousCredentialHash??row.participant.credentialHash,
      resetHash:resetCodeHash(projectId,resetCode),resetExpiresAt:expiresAt,updatedAt:new Date()}})
    await tx.surveyParticipant.update({where:{id:row.participantId!},data:{credentialHash:codeCredentialHash(randomBytes(32).toString('base64url'))}})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actorId,projectId,action:'PARTICIPANT_CODE_RESET_ISSUED',metadata:{participantId:row.participantId}}})
  })
  return {resetCode,expiresAt:expiresAt.toISOString()}
}
export async function completeMemorableReset(publicId:string,resetCodeValue:string,suffixValue:string){
  const p=await codeProject(publicId,'MEMORABLE_CODE'),parsed=parseMemorableCode(resetCodeValue),suffix=suffixValue.normalize('NFKC').trim().toUpperCase()
  if(!parsed||!/^[A-Z0-9]{4,12}$/.test(suffix))fail(403)
  const hash=resetCodeHash(p.id,parsed!.prefix+'-'+parsed!.suffix)
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${p.id} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM survey_participant_codes WHERE project_id=${p.id} AND prefix=${parsed!.prefix} FOR UPDATE`
    const row=await tx.surveyParticipantCode.findUnique({where:{projectId_prefix:{projectId:p.id,prefix:parsed!.prefix}},include:{participant:true}})
    if(!row?.participant||row.participant.status!=='ACTIVE'||row.resetHash!==hash||!row.resetExpiresAt||row.resetExpiresAt<=new Date())fail(403)
    if(row.previousCredentialHash===codeCredentialHash(await memorableCredential(p.id,parsed!.prefix,suffix,row.credentialVersion-1)))fail(400,'请选择与原编码不同的新后缀。')
    const secret=await memorableCredential(p.id,parsed!.prefix,suffix,row.credentialVersion)
    await tx.surveyParticipant.update({where:{id:row.participantId!},data:{credentialHash:codeCredentialHash(secret)}})
    await tx.surveyParticipantCode.update({where:{id:row.id},data:{resetHash:null,resetExpiresAt:null,previousCredentialHash:null,updatedAt:new Date()}})
    await tx.surveyEvent.create({data:{id:randomUUID(),projectId:p.id,action:'PARTICIPANT_CODE_RESET_COMPLETED',metadata:{participantId:row.participantId}}})
    return {researchCode:row.participant.researchCode,accessCredential:secret}
  })
}

/** The client cannot choose, reserve or probe a generated credential. */
export async function joinGeneratedCodeStudy(input:{publicId:string;waveId:string;entryToken:string;consent:boolean;consentVersion:number}){
 const p=await codeProject(input.publicId,'SELF_CODE')
 try{return await createLinkedResearchIdentity({...input,projectId:p.id,generatedCode:true})}
 catch(e){if((e as {code?:string}).code==='P2002')fail(503,'编码领取暂未完成，请重试。');throw e}
}
