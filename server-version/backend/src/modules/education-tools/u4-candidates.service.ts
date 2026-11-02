import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {authorizePrivateTool,privateToolScope} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {privateToolContentHash,validatePrivateToolDefinition} from './private-tool.definition'
import {u4Candidate,u4CandidateList} from './content/u4/catalog'

export async function listU4Candidates(c:PrivateToolContext){
 if(c.entry!=='TEACHER')privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
 return prisma.$transaction(async tx=>{await authorizePrivateTool(tx,c);return {version:'0.3.0-candidate',list:u4CandidateList()}})
}
/** Explicit selection creates one editable private draft, never publishes or
 * assigns a task. Source snapshots and existing drafts remain untouched. */
export async function createU4Candidate(c:PrivateToolContext,raw:unknown){
 if(c.entry!=='TEACHER')privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
 const {key}=z.object({key:z.string().min(1).max(160)}).strict().parse(raw),candidate=u4Candidate(key)
 if(!candidate)privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
 const checked=validatePrivateToolDefinition('FORM',candidate.definition)
 if(!checked.valid)privateToolFail('PRIVATE_TOOL_DEFINITION_INCOMPLETE',400,checked.issues)
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c,{kind:'FORM'})
  const row=await tx.educationPrivateTool.create({data:{id:randomUUID(),...privateToolScope(c),kind:'FORM',title:candidate.title,
   definition:JSON.parse(JSON.stringify(candidate.definition)),contentHash:privateToolContentHash('FORM',candidate.title,candidate.definition)}})
  return {...row,visibility:'AUTHOR_PRIVATE',snapshotOnly:true,canPublish:false,canShare:false,canReadParticipantReports:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
