const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({setup(o){this.id=o.id},async fetch(runtime){const result=await runtime.domains.list('assessments');const row=result.list.find(item=>item.id===this.id);if(!row)throw new Error('测评不存在或当前无权查看');return {title:row.title,description:row.status,notice:'测评作答与完整报告 Runtime 尚未开放。请在当前 Web 的“我的测评”中继续。'}}}))
