const specs = {STUDENT:require('./student/index'),PARENT:require('./parent/index'),TEACHER:require('./teacher/index'),ADMIN:require('./admin/index')}
function createWorkspaceService(domains, session) {
  return {
    async home() {
      const spec = specs[session.get().activeRole]
      if (!spec) throw new Error('身份不可用')
      const blocks = await Promise.all(spec.domains.map(async domain => {
        const result = await domains.list(domain)
        return {domain, title:result.title, total:result.total, list:result.list.slice(0,3), truncated:result.truncated}
      }))
      return {title:spec.title, description:spec.description, blocks}
    },
  }
}
module.exports = { createWorkspaceService }
