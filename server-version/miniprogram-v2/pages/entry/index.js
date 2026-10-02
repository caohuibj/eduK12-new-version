const { parseEntry, resolveEntry } = require('../../app/entry/index')
const { destination } = require('../../app/router/index')
Page({
 data:{status:'loading',title:'Huisurvey',description:'正在准备您的工作区',errorMessage:''},
 onLoad(options){const app=getApp();if(options.kind||options.q||options.scene){try{app.pendingEntry=parseEntry(options,app.runtime.config.origin)}catch(error){app.entryError=error.message}}},
 onShow(){this.enter()},
 async enter(){
  const app=getApp();this.setData({status:'loading',errorMessage:''})
  try{
   if(app.entryError)throw new Error(app.entryError)
   await app.ready
   const session=app.runtime.session.get()
   if(!app.pendingEntry){wx.reLaunch({url:destination(session)});return}
   const result=await resolveEntry(app.pendingEntry,session,app.runtime.domains)
   if(result.status==='unavailable'){this.setData({status:'ready',message:result.message});return}
   if(result.status==='ready')app.pendingEntry=null
   wx.reLaunch({url:result.destination})
  }catch(error){this.setData({status:'error',errorMessage:error.message})}
 },
 async retry(){getApp().ready=getApp().runtime.session.refresh();getApp().ready.catch(()=>{});await this.enter()},
 home(){getApp().pendingEntry=null;getApp().entryError=null;wx.reLaunch({url:destination(getApp().runtime.session.get())})},
})
