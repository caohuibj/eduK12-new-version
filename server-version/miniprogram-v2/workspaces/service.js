const specs = {STUDENT:require('./student/index'),PARENT:require('./parent/index'),TEACHER:require('./teacher/index'),ADMIN:require('./admin/index')}
function createWorkspaceService(domains, session, parents) {
  return {
    async home() {
      const spec = specs[session.get().activeRole]
      if (!spec) throw new Error('身份不可用')
      const jobs = spec.domains.map(async domain => {
        const result = await domains.list(domain)
        return {domain, title:result.title, total:result.total, list:result.list.slice(0,3), truncated:result.truncated}
      })
      if(session.get().capabilities.canReadChildren) {
        jobs.unshift(parents.view({view:'children'}).then(result=>({domain:'children',title:'我的孩子',total:null,list:result.list.slice(0,3).map(row=>Object.assign({domain:'children'},row))})))
      }
      const blocks = await Promise.all(jobs)
      return {title:spec.title, description:session.get().capabilities.canReadChildren?'查看已确认关联的孩子与获准报告，以及分配给您的测评。':spec.description, blocks}
    },
  }
}
module.exports = { createWorkspaceService }
