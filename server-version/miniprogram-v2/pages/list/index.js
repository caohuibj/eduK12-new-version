const { workspacePage } = require('../../app/pages/index')
const operationsDomains=['assignments','checkins','students','classrooms','teacherCodes','catalog','courses','users']
Page(workspacePage({setup(options){this.domain=options.domain;this.parent=options.parent;this.view=options.view||'';this.page=1;this.keyword=''},async fetch(runtime){this.page=1;const result=runtime.operations&&operationsDomains.includes(this.domain)?await runtime.operations.list(this.domain,{parent:this.parent,view:this.view,keyword:this.keyword}):await runtime.domains.list(this.domain);return Object.assign({domain:this.domain,empty:!result.list.length,description:this.domain==='assessments'?'作答与报告以当前服务器权限为准。':''},result)},methods:{
 longitudinal(){if(this.domain==='assessments')wx.navigateTo({url:'/pages/report/index?mode=longitudinal'})},
 catalog(){if(this.domain==='assessments')wx.navigateTo({url:'/pages/assessment-entry/index?mode=catalog'})},
 change(e){this.keyword=e.detail.value},search(){return this.load()},
 action(e){const key=e.currentTarget.dataset.key;if(!(this.data.actions||[]).some(item=>item.key===key))return;wx.navigateTo({url:'/pages/operation/index?domain='+this.domain+'&action='+encodeURIComponent(key)+(this.parent&&!this.view?'&courseId='+encodeURIComponent(this.parent):'')})},
 select(event){const row=this.data.list.find(item=>item.id===event.detail.id);if(!row)return;
  if(this.view||this.domain==='students'){wx.navigateTo({url:'/pages/record/index?domain='+this.domain+'&parent='+encodeURIComponent(this.parent||'')+'&view='+this.view+'&page='+(row.sourcePage||this.page)+'&id='+encodeURIComponent(row.id)});return}
  const destination=row.destination||('/pages/detail/index?domain='+encodeURIComponent(row.domain||this.domain)+'&id='+encodeURIComponent(row.resourceId||row.id));wx.navigateTo({url:destination})
 },
 async more(){if(this.data.status==='submitting'||!this.data.hasMore)return;const sequence=this.sequence;this.setData({status:'submitting'});try{const runtime=getApp().runtime;const next=runtime.operations&&operationsDomains.includes(this.domain)?await runtime.operations.list(this.domain,{page:this.page+1,parent:this.parent,view:this.view,keyword:this.keyword}):await runtime.domains.list(this.domain,this.page+1);if(sequence!==this.sequence)return;this.page+=1;this.setData({list:this.data.list.concat(next.list),hasMore:next.hasMore,status:'ready'})}catch(error){if(sequence===this.sequence)this.setData({status:'ready',moreError:error.message})}},
}}))
