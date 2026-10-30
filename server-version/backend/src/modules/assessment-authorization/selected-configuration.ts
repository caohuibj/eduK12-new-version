import {z} from 'zod'
import {canonicalHash,retainImmutableCanonicalValue} from '../assessment-runtime/canonical'
import {standardAxisHashes,standardCombinationHash} from '../measurement-content/standard-combination'

const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/),version=z.string().min(1).max(200)
export const configurationProductSchema=z.enum(['TRAINING','SURVEY','SCHOOL','TEACHER'])
const pointer=z.object({releaseId:id,contentHash:hash}).strict()
const axis=z.object({version,hash}).strict()

/** Identity projections of existing immutable releases/snapshots. No executable
 * body, authority decision, default selection, or per-attempt random seed. */
export const selectedConfigurationSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('STANDARD_COMBINATION'),toolKey:version,instrumentVersion:version,
    combinationId:id,combinationHash:hash,measurement:pointer,
    axes:z.object({CONTENT:axis,PARAMETERS:axis,REPORT:axis}).strict(),
  }).strict(),
  z.object({kind:z.literal('COGNITIVE_PROFILE'),testType:version,configId:id,configVersion:version,
    engineVersion:version,scoringVersion:version,measurement:pointer,
    profile:z.enum(['experience','standard','research']),profileDefinitionVersion:version,
    resolvedConfigHash:hash,protocolSignature:hash,metricDefinitionVersion:version,
    qualityDefinitionVersion:version,reportDefinitionVersion:version,reportHash:hash,
    presentationVersion:version.nullable(),
  }).strict(),
])
export type SelectedConfiguration=z.infer<typeof selectedConfigurationSchema>

const authority=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('ENTRY_ADMIN'),id,revision:z.number().int().positive()}).strict(),
  z.object({kind:z.literal('CONTENT_DELEGATION'),id,revision:z.number().int().positive()}).strict(),
])
export const configurationUseRevisionSchema=z.object({
  kind:z.enum(['TRAINING_STANDARD_USE','SURVEY_TOOL_USE','EDUCATION_SOURCE_USE','LIBRARY_USE','COGNITIVE_PROFILE_USE']),
  id,revision:z.number().int().positive(),issuerId:id,recipientId:id,organizationId:id.nullable(),
  authority:z.array(authority).min(1).max(100),
}).strict()

const body=z.object({schemaVersion:z.literal(1),product:configurationProductSchema,
  configuration:selectedConfigurationSchema,configurationHash:hash,
  authorization:configurationUseRevisionSchema,
}).strict().superRefine((value,ctx)=>{
  if(canonicalHash(value.configuration)!==value.configurationHash)
    ctx.addIssue({code:'custom',path:['configurationHash'],message:'SELECTED_CONFIGURATION_HASH_MISMATCH'})
  if(value.configuration.kind==='STANDARD_COMBINATION'
    &&standardCombinationHash(value.configuration.toolKey,standardAxisHashes(value.configuration.axes))!==value.configuration.combinationHash)
    ctx.addIssue({code:'custom',path:['configuration','combinationHash'],message:'SELECTED_COMBINATION_HASH_MISMATCH'})
  const education=value.product==='SCHOOL'||value.product==='TEACHER'
  if(education!==Boolean(value.authorization.organizationId))
    ctx.addIssue({code:'custom',path:['authorization','organizationId'],message:'SELECTED_CONFIGURATION_SCOPE_MISMATCH'})
  const kind=value.authorization.kind
  if((kind==='TRAINING_STANDARD_USE'&&value.product!=='TRAINING')
    ||(kind==='SURVEY_TOOL_USE'&&value.product!=='SURVEY')
    ||(kind==='EDUCATION_SOURCE_USE'&&!education)
    ||(kind==='COGNITIVE_PROFILE_USE'&&value.configuration.kind!=='COGNITIVE_PROFILE')
    ||(kind==='TRAINING_STANDARD_USE'&&value.configuration.kind!=='STANDARD_COMBINATION'))
    ctx.addIssue({code:'custom',path:['authorization','kind'],message:'SELECTED_CONFIGURATION_AUTHORIZATION_KIND_MISMATCH'})
  const identities=value.authorization.authority.map(row=>JSON.stringify([row.kind,row.id]))
  if(new Set(identities).size!==identities.length)
    ctx.addIssue({code:'custom',path:['authorization','authority'],message:'DUPLICATE_CONFIGURATION_AUTHORITY'})
})
export const selectedConfigurationBindingSchema=z.object({binding:body,bindingHash:hash}).strict()
  .superRefine((value,ctx)=>{
    if(canonicalHash(value.binding)!==value.bindingHash)
      ctx.addIssue({code:'custom',path:['bindingHash'],message:'SELECTED_BINDING_HASH_MISMATCH'})
  })
export type SelectedConfigurationBinding=z.infer<typeof selectedConfigurationBindingSchema>

/** Internal service boundary only. The entry adapter must resolve approved
 * immutable facts, mechanically validate the configuration once, and verify
 * issuer/recipient authority in its existing transaction BEFORE sealing.
 * Possessing this hash or passing this parser never grants current authority. */
export function sealSelectedConfigurationBinding(input:{product:z.infer<typeof configurationProductSchema>;
  configuration:SelectedConfiguration;authorization:z.infer<typeof configurationUseRevisionSchema>}){
  const configuration=selectedConfigurationSchema.parse(input.configuration)
  const binding=body.parse({schemaVersion:1,...input,configuration,configurationHash:canonicalHash(configuration)})
  return retainImmutableCanonicalValue(selectedConfigurationBindingSchema.parse({binding,bindingHash:canonicalHash(binding)}))
}

/** Parse historical identity without consulting current grants/registry. Data
 * access and new-use lifecycle checks remain in the calling entry service.
 * Only absent old fields return null; corrupt/unsupported provided values fail. */
export function readSelectedConfigurationBinding(raw:unknown,expected?:{
  product?:z.infer<typeof configurationProductSchema>;recipientId?:string;organizationId?:string|null;
  authorizationId?:string;authorizationRevision?:number;
}){
  if(raw===undefined||raw===null)return null
  const sealed=selectedConfigurationBindingSchema.parse(raw),b=sealed.binding
  if(expected&&(expected.product!==undefined&&expected.product!==b.product
    ||expected.recipientId!==undefined&&expected.recipientId!==b.authorization.recipientId
    ||expected.organizationId!==undefined&&expected.organizationId!==b.authorization.organizationId
    ||expected.authorizationId!==undefined&&expected.authorizationId!==b.authorization.id
    ||expected.authorizationRevision!==undefined&&expected.authorizationRevision!==b.authorization.revision))
    throw new Error('SELECTED_CONFIGURATION_CONTEXT_MISMATCH')
  return retainImmutableCanonicalValue(sealed)
}

/** Resolve business-labelled defaults only after the entry service has filtered
 * current, authorized choices. Ambiguity is an administrator action, never latest. */
export function resolveSelectedConfigurationChoice<T extends {id:string;isDefault:boolean}>(choices:readonly T[]):T|null{
  if(choices.length===0)return null
  if(new Set(choices.map(row=>row.id)).size!==choices.length)throw new Error('DUPLICATE_CONFIGURATION_CHOICE')
  const defaults=choices.filter(row=>row.isDefault)
  if(defaults.length===1)return defaults[0]
  if(defaults.length>1||choices.length>1)throw new Error('ADMIN_CONFIGURATION_SELECTION_REQUIRED')
  return choices[0]
}
