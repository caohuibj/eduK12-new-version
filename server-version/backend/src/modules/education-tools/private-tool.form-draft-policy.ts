import type {RelationalProductEntryV1} from '../assessment-relational/product-registry'
import {projectRelationalRunPolicy,relationalEntryToRunPolicy} from '../assessment-run/resourceAuthority'
import {canonicalHash} from '../assessment-runtime/canonical'
import {privateFormOriginSchema,privateFormResourceKey} from './private-tool.form-runtime-contracts'
import {privateFormResourceEntry} from './private-tool.form-runtime-source'
import {privateToolFail} from './private-tool.contracts'

/** Internal Run draft/publication metadata only: callers obtain this exact source from the
 * database-backed private FORM reader/preparer, never from a client DTO.
 * A previously sealed source can be attached to a new draft. This projection
 * does not authorize publication, execution, or answer/report access. */
export function privateFormDraftResourcePolicy(source:{origin:unknown;compositeId:string;resourceEntry:RelationalProductEntryV1;identityOnly:true;canPublish:false}){
 const origin=privateFormOriginSchema.parse(source.origin),entry=source.resourceEntry
 if(!source.identityOnly||source.canPublish!==false||!['DRAFT','PUBLISHED'].includes(entry.releaseStatus)
  ||entry.applicability.resourceKind!=='FORM'||entry.applicability.resourceKey!==privateFormResourceKey(origin)
  ||entry.applicability.resourceVersion!==origin.adapterVersion
  ||entry.launchTarget?.runtime!=='COMPOSITE'||entry.launchTarget.compositeAssessmentId!==source.compositeId
  ||canonicalHash(entry)!==canonicalHash(privateFormResourceEntry(origin,entry.title,source.compositeId,entry.releaseStatus as 'DRAFT'|'PUBLISHED')))
  privateToolFail('PRIVATE_FORM_DRAFT_IDENTITY_INVALID')
 return entry.releaseStatus==='PUBLISHED'?relationalEntryToRunPolicy(entry):projectRelationalRunPolicy(entry)
}
