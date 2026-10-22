const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({fetch:async runtime=>runtime.training?{...await runtime.training.courses(),title:'我的课程',description:'选择课程，继续学习',training:true,empty:false,moreLoading:false,moreError:''}:Object.assign(await runtime.workspaces.home(),{shortcuts:require('../../app/navigation/index').shortcutsFor(runtime.session.get())}),methods:{
 async moreCourses(){
  if(this.data.moreLoading||!this.data.nextCursor)return
  const sequence=this.sequence,cursor=this.data.nextCursor;this.setData({moreLoading:true,moreError:''})
  try{const result=await getApp().runtime.training.courses(cursor);if(this.unloaded||sequence!==this.sequence)return;this.setData({courses:[...new Map([...this.data.courses,...result.courses].map(c=>[c.id,c])).values()],nextCursor:result.nextCursor,moreLoading:false})}
  catch(e){if(!this.unloaded&&sequence===this.sequence)this.setData({moreLoading:false,moreError:e.message})}
 },
 course(e){if(this.data.courses?.some(c=>c.id===e.currentTarget.dataset.id))wx.navigateTo({url:'/pages/course/index?id='+encodeURIComponent(e.currentTarget.dataset.id)})},
 join(){wx.navigateTo({url:'/pages/operation/index?domain=courses&action=join'})},
 profile(){wx.navigateTo({url:'/pages/profile/index'})},
 select(event){if(event.detail.domain==='children'){wx.navigateTo({url:'/pages/parents/index?view=child&childId='+encodeURIComponent(event.detail.id)});return}const row=this.data.blocks.flatMap(block=>block.list).find(item=>item.id===event.detail.id&&item.domain===event.detail.domain);if(row)wx.navigateTo({url:row.destination||('/pages/detail/index?domain='+encodeURIComponent(row.domain)+'&id='+encodeURIComponent(row.id))})},
 more(event){const domain=event.currentTarget.dataset.domain;require('../../app/navigation/index').navigate(wx,getApp().runtime.session.get(),domain)},
 shortcut(e){require('../../app/navigation/index').navigate(wx,getApp().runtime.session.get(),e.currentTarget.dataset.key)},
 scan(){wx.scanCode({onlyFromCamera:true,success:result=>{const app=getApp();try{app.pendingEntry=(app.runtime.training?require('../../app/training/entry'):require('../../app/entry/index')).parseEntry({q:result.result},app.runtime.config.origin);app.entryError=null;wx.reLaunch({url:'/pages/entry/index'})}catch(error){wx.showToast({title:error.message,icon:'none'})}}})},
}}))
