const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({fetch(runtime){const user=runtime.session.get().user;return {title:'我的账户',canManageParentLinks:runtime.session.get().capabilities.canManageParentLinks===true,username:user.username,nickname:user.nickname||user.username}},methods:{
 parentLinks(){wx.navigateTo({url:'/pages/parents/index?view=links'})},
 edit(){wx.navigateTo({url:'/pages/operation/index?domain=profile&id='+encodeURIComponent(getApp().runtime.session.get().user.id)+'&action=edit'})},
 password(){wx.navigateTo({url:'/pages/auth/password/index'})},
 async logout(){if(this.data.status==='submitting')return;this.setData({status:'submitting'});try{await getApp().runtime.session.logout()}catch(_){}finally{getApp().pendingEntry=null;wx.reLaunch({url:'/pages/auth/login/index'})}},
}}))
