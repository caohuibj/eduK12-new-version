const {ApiError}=require('../../core/errors/index')
const {identifier}=require('./service')
function createParentPublicationService(api,session){
 const owner=()=>{if(!session.get().user||!session.get().capabilities.canDiscoverOrganizations)throw new ApiError('forbidden','请重新登录并核对组织权限')}
 return {
  async list(organizationId){owner();const context=await api.get('/organizations/'+identifier(organizationId)+'/context');if(!context.allowedActions?.includes('PARENT_REPORT_PUBLICATION'))throw new ApiError('forbidden','当前没有家长报告披露能力');const raw=await api.get('/parent-report-publications?organizationId='+identifier(organizationId));return {title:'家长报告发布与授权',list:raw.list.map(r=>({id:r.id,title:r.title,detail:r.generatedAt,canOpen:true})),truncated:raw.truncated===true}},
  preview(artifactId){owner();return api.post('/parent-report-publications/'+identifier(artifactId)+'/preview',{})},
  publish(preview){owner();if(!preview.allowedActions?.includes('PUBLISH'))throw new ApiError('forbidden','请先重新预览报告');return api.post('/parent-report-publications/'+identifier(preview.artifactId)+'/publish',{templateKey:preview.template.key,templateVersion:preview.template.version,previewHash:preview.previewHash,expectedVersion:preview.expectedVersion,commandKey:preview.commandKey})},
  consents(artifactId){owner();return api.get('/parent-report-publications/'+identifier(artifactId)+'/consents')},
  grant(artifactId,row){owner();if(!row.allowedActions?.includes('GRANT'))throw new ApiError('forbidden','该同意尚未开放授权');return api.post('/parent-links/'+identifier(row.relationshipId)+'/reports/'+identifier(artifactId)+'/grants',{consentId:row.id,commandKey:row.commandKey})},
 }
}
module.exports={createParentPublicationService}
