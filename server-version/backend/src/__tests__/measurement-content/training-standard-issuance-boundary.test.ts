import {describe,expect,it,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {adminContentRootRequestSchema} from '../../modules/measurement-content/admin-authority.service'
import {ids} from './training-standard-source.fixture'

describe('existing 21B issuance boundary remains explicit',()=>{
  it.each(['exact-key','uuid-only'])('does not claim the current root issuer supports a Training combination use grant: %s',key=>{
    const result=adminContentRootRequestSchema.safeParse({requestId:ids.root,expectedVersion:0,reason:'SYNTHETIC CONTRACT ONLY',grant:{
      subjectId:ids.issuer,scope:{product:'TRAINING',scopeKind:'COURSE',scopeId:ids.course,resourceKind:'material',
        resourceKeys:[key==='exact-key'?'standard-combination:'+ids.combo+':'+('a'.repeat(64)):ids.combo]},
      capabilities:['material.use'],delegableCapabilities:['material.use'],remainingDelegationDepth:1,
      validFrom:'2026-10-25T00:00:00Z',expiresAt:'2027-01-01T00:00:00Z',
    }})
    expect(result.success).toBe(false)
    if(!result.success)expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'custom',message:'Only supported exact project, course, governance, entry-distribution or education public-source use grants are allowed'}),
    ]))
  })
  it('reuses the supported 21B exact C distribution scope without widening the root schema',()=>{
    const result=adminContentRootRequestSchema.safeParse({requestId:ids.root,expectedVersion:0,reason:'SYNTHETIC EXISTING SCOPE',grant:{
      subjectId:ids.issuer,scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:[ids.measurement]},
      capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,
      validFrom:'2026-10-25T00:00:00Z',expiresAt:'2027-01-01T00:00:00Z',
    }})
    expect(result.success).toBe(true)
  })
})
