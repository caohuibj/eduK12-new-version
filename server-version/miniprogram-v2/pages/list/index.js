const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({setup(options){this.domain=options.domain;this.page=1},async fetch(runtime){this.page=1;const result=await runtime.domains.list(this.domain);return Object.assign({empty:!result.list.length,description:this.domain==='tasks'||this.domain==='assessments'?'查看任务状态；作答与报告请使用当前 Web 客户端。':''},result)},methods:{
 select(event){wx.navigateTo({url:'/pages/detail/index?domain='+encodeURIComponent(this.domain)+'&id='+encodeURIComponent(event.detail.id)})},
 async more(){if(this.data.status==='submitting'||!this.data.hasMore)return;const sequence=this.sequence;this.setData({status:'submitting'});try{const next=await getApp().runtime.domains.list(this.domain,this.page+1);if(sequence!==this.sequence)return;this.page+=1;this.setData({list:this.data.list.concat(next.list),hasMore:next.hasMore,status:'ready'})}catch(error){if(sequence===this.sequence)this.setData({status:'ready',moreError:error.message})}},
}}))
