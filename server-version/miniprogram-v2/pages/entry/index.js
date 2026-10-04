const { parseEntry, resolveEntry } = require('../../app/entry/index')
const { destination } = require('../../app/router/index')
Page({
 data:{status:'loading',title:'Huisurvey',description:'正在准备您的工作区',errorMessage:''},
 onLoad(options){const app=getApp();if(!app.runtime)return;if(options.kind||options.q||options.scene){try{app.pendingEntry=parseEntry(options,app.runtime.config.origin)}catch(error){app.entryError=error.message}}},
 onShow(){this.enter()},
 async enter(){
  const app=getApp(),sequence=this.sequence=(this.sequence||0)+1;this.setData({status:'loading',errorMessage:''})
  try{
   if(app.entryError)throw new Error(app.entryError)
   await app.ready
   if(this.closed||sequence!==this.sequence)return
   const session=app.runtime.session.get()
   if(!app.pendingEntry){wx.reLaunch({url:destination(session)});return}
   const entry=app.pendingEntry,result=await resolveEntry(entry,session,app.runtime.domains)
   if(this.closed||sequence!==this.sequence||app.pendingEntry!==entry)return
   if(result.status==='unavailable'){this.setData({status:'ready',message:result.message});return}
   if(result.status==='ready')app.pendingEntry=null
   wx.reLaunch({url:result.destination})
  }catch(error){if(!this.closed&&sequence===this.sequence)this.setData({status:'error',errorMessage:error.message})}
 },
 onUnload(){this.closed=true;this.sequence=(this.sequence||0)+1},
 async retry(){if(!getApp().runtime)return this.enter();getApp().ready=getApp().runtime.session.refresh();getApp().ready.catch(()=>{});await this.enter()},
 home(){if(!getApp().runtime)return this.enter();getApp().pendingEntry=null;getApp().entryError=null;wx.reLaunch({url:destination(getApp().runtime.session.get())})},
})
