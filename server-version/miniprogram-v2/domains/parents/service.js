const { ApiError } = require('../../core/errors/index')
const statusLabels = {PENDING:'待学生确认',ACTIVE:'已关联',REVOKED:'已解除'}
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new ApiError('invalidRequest','内容标识无效')
  return encodeURIComponent(value)
}
function list(data) {
  if (!data || !Array.isArray(data.list)) throw new ApiError('invalidResponse','列表响应无效')
  return data.list
}
function createParentService(api, session) {
  function authorize(capability) {
    if (session.get().capabilities[capability] !== true) throw new ApiError('forbidden','此入口尚未开放或无权访问')
  }
  function linkPath(id, artifactId) {
    return '/parent-links/'+identifier(id)+(artifactId ? '/reports/'+identifier(artifactId) : '')
  }
  function childPath(id) {return '/parents/me/children/'+identifier(id)}
  return {
    async view(options, page=1) {
      const view=options.view
      if (view==='links') {
        authorize('canManageParentLinks')
        const [data,consent]=await Promise.all([api.get('/parent-links'),api.get('/parent-links/consent')])
        if (typeof consent.text!=='string'||typeof consent.version!=='string') throw new ApiError('invalidResponse','同意内容无效')
        return {title:'家长关联',links:list(data).map(row=>({id:row.id,title:row.title,status:statusLabels[row.status]||row.status,canApprove:row.canApprove===true,canRevoke:row.canRevoke===true,canConsentReports:row.canConsentReports===true})),
          canInvite:data.canInvite===true,canClaim:data.canClaim===true,consent,truncated:data.truncated===true,
          description:'关联需要学生确认。每份孩子报告还需单独授权。'}
      }
      if(view==='reportOptions'){authorize('canManageParentLinks');const data=await api.get(linkPath(options.relationshipId)+'/report-options');return {title:'选择向家长披露的报告',list:list(data).map(r=>({id:r.id,title:r.title,canOpen:r.canConsent===true})),truncated:data.truncated===true,description:'这里只展示正式发布的家长专用内容。每份报告可分别决定是否同意。'}}
      if (view==='children') {
        authorize('canReadChildren')
        const data=await api.get('/parents/me/children?page='+page+'&pageSize=20')
        return {title:options.next==='reports'?'选择孩子查看报告':'我的孩子',list:list(data).map(row=>({id:row.childId,title:row.displayName,canOpen:true})),hasMore:data.hasMore===true,
          description:'只展示已获学生确认的关联。可在“我的 → 家长关联”提交关联申请。'}
      }
      if (view==='child') {
        authorize('canReadChildren')
        const data=await api.get(childPath(options.childId)+'/overview')
        if (!data.child || !Array.isArray(data.courses)) throw new ApiError('invalidResponse','孩子概况响应无效')
        return {title:data.child.displayName,child:data.child,courses:data.courses,relationshipId:data.relationshipId,
          canReadReports:session.get().capabilities.canReadChildReports===true,description:'课程与活动概况'}
      }
      if (view==='reports') {
        authorize('canReadChildReports')
        const data=await api.get(childPath(options.childId)+'/reports?page='+page+'&pageSize=20')
        return {title:'孩子报告',list:list(data).map(row=>({id:row.id,title:row.title,canOpen:true})),hasMore:data.hasMore===true,
          description:'仅展示已单独同意并获准披露的家长版报告。暂无报告时，不代表孩子未完成测评。'}
      }
      if (view==='report') {
        authorize('canReadChildReports')
        const data=await api.get(childPath(options.childId)+'/reports/'+identifier(options.artifactId))
        if(data.schemaVersion!==1||data.audience!=='PARENT'||!Array.isArray(data.blocks)||typeof data.summary!=='string') throw new ApiError('invalidResponse','报告格式暂不支持')
        return {title:data.title,report:data,reportBlocks:data.blocks.map((block,index)=>Object.assign({key:String(index)},block)),description:'内容由服务端报告提供'}
      }
      if (view==='consent') {
        authorize('canManageParentLinks')
        const data=await api.get(linkPath(options.relationshipId,options.artifactId)+'/consent')
        if(data.canConsent!==true||!data.projection||data.projection.audience!=='PARENT'||!Array.isArray(data.projection.blocks)||typeof data.consentText!=='string'||typeof data.commandKey!=='string') throw new ApiError('invalidResponse','授权预览无效')
        return {title:'报告授权预览',preview:data,report:data.projection,reportBlocks:data.projection.blocks.map((block,index)=>Object.assign({key:String(index)},block)),description:'请核对家长与本次报告内容后决定是否同意。'}
      }
      throw new ApiError('notFound','入口不存在')
    },
    async inviteCourses() {
      authorize('canManageParentLinks')
      const data=await api.get('/courses/my')
      return list(data).slice(0,20).map(row=>({id:row.id,title:row.title}))
    },
    invite(courseId) {authorize('canManageParentLinks');return api.post('/parent-links/invitations',{courseId:decodeURIComponent(identifier(courseId))})},
    claim(inviteCode) {
      authorize('canManageParentLinks')
      if(typeof inviteCode!=='string'||!/^[A-Za-z0-9_-]{24}$/.test(inviteCode)) throw new ApiError('invalidRequest','请填写完整的24位邀请码')
      return api.post('/parent-links/claims',{inviteCode})
    },
    approve(id,consentVersion) {authorize('canManageParentLinks');return api.post(linkPath(id)+'/approve',{consentVersion})},
    revoke(id) {authorize('canManageParentLinks');return api.post(linkPath(id)+'/revoke',{reason:'用户确认解除关联'})},
    accept(preview) {
      authorize('canManageParentLinks')
      return api.post(linkPath(preview.relationshipId,preview.artifactId)+'/consent',{commandKey:preview.commandKey,consentVersion:preview.consentVersion,...(preview.publicationHash?{publicationHash:preview.publicationHash}:{})})
    },
    withdraw(id,artifactId) {authorize('canManageParentLinks');return api.post(linkPath(id,artifactId)+'/revoke',{reason:'用户确认撤回报告授权'})},
  }
}
module.exports = {createParentService,identifier}
