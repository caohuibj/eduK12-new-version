const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({fetch:runtime=>runtime.workspaces.home(),methods:{
 select(event){wx.navigateTo({url:'/pages/detail/index?domain='+encodeURIComponent(event.detail.domain)+'&id='+encodeURIComponent(event.detail.id)})},
 more(event){const domain=event.currentTarget.dataset.domain;require('../../app/navigation/index').navigate(wx,getApp().runtime.session.get(),domain)},
 scan(){wx.scanCode({onlyFromCamera:true,success:result=>{const app=getApp();try{app.pendingEntry=require('../../app/entry/index').parseEntry({q:result.result},app.runtime.config.origin);app.entryError=null;wx.reLaunch({url:'/pages/entry/index'})}catch(error){wx.showToast({title:error.message,icon:'none'})}}})},
}}))
