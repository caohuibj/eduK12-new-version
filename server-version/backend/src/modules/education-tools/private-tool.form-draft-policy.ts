import type {RelationalProductEntryV1} from '../assessment-relational/product-registry'
import {projectRelationalRunPolicy} from '../assessment-run/resourceAuthority'
import {canonicalHash} from '../assessment-runtime/canonical'
import {privateFormOriginSchema,privateFormResourceKey} from './private-tool.form-runtime-contracts'
import {privateFormResourceEntry} from './private-tool.form-runtime-source'
import {privateToolFail} from './private-tool.contracts'

/** Internal DRAFT metadata only: callers obtain this exact source from the
 * database-backed private FORM reader/preparer, never from a client DTO.
 * Does not authorize publication, execution, or answer/report access. */
export function privateFormDraftResourcePolicy(source:{origin:unknown;compositeId:string;resourceEntry:RelationalProductEntryV1;identityOnly:true;canPublish:false}){
 const origin=privateFormOriginSchema.parse(source.origin),entry=source.resourceEntry
 if(!source.identityOnly||source.canPublish!==false||entry.releaseStatus!=='DRAFT'
  ||entry.applicability.resourceKind!=='FORM'||entry.applicability.resourceKey!==privateFormResourceKey(origin)
  ||entry.applicability.resourceVersion!==origin.adapterVersion
  ||entry.launchTarget?.runtime!=='COMPOSITE'||entry.launchTarget.compositeAssessmentId!==source.compositeId
  ||canonicalHash(entry)!==canonicalHash(privateFormResourceEntry(origin,entry.title,source.compositeId)))
  privateToolFail('PRIVATE_FORM_DRAFT_IDENTITY_INVALID')
 return projectRelationalRunPolicy(entry)
}
