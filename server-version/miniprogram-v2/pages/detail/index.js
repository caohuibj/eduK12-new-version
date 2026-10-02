const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({setup(options){this.domain=options.domain;this.id=options.id},fetch(runtime){return runtime.domains.detail(this.domain,this.id).then(result=>({title:result.title,description:result.description,resourceStatus:result.status}))}}))
