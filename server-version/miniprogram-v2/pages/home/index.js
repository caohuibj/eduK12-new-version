const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({fetch:async runtime=>Object.assign(await runtime.workspaces.home(),{shortcuts:require('../../app/navigation/index').shortcutsFor(runtime.session.get())}),methods:{
 select(event){if(event.detail.domain==='children'){wx.navigateTo({url:'/pages/parents/index?view=child&childId='+encodeURIComponent(event.detail.id)});return}const row=this.data.blocks.flatMap(block=>block.list).find(item=>item.id===event.detail.id&&item.domain===event.detail.domain);if(row)wx.navigateTo({url:row.destination||('/pages/detail/index?domain='+encodeURIComponent(row.domain)+'&id='+encodeURIComponent(row.id))})},
 more(event){const domain=event.currentTarget.dataset.domain;require('../../app/navigation/index').navigate(wx,getApp().runtime.session.get(),domain)},
 shortcut(e){require('../../app/navigation/index').navigate(wx,getApp().runtime.session.get(),e.currentTarget.dataset.key)},
 scan(){wx.scanCode({onlyFromCamera:true,success:result=>{const app=getApp();try{app.pendingEntry=require('../../app/entry/index').parseEntry({q:result.result},app.runtime.config.origin);app.entryError=null;wx.reLaunch({url:'/pages/entry/index'})}catch(error){wx.showToast({title:error.message,icon:'none'})}}})},
}}))
