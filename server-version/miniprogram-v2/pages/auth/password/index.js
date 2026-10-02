Page({
 data:{oldPassword:'',newPassword:'',confirmation:'',status:'ready',errorMessage:''},
 change(event){const key=event.currentTarget.dataset.field;if(['oldPassword','newPassword','confirmation'].includes(key))this.setData({[key]:event.detail.value})},
 async submit(){if(this.data.status==='submitting')return;if(!this.data.oldPassword||this.data.newPassword!==this.data.confirmation){this.setData({errorMessage:'请填写原密码，并确认两次新密码一致'});return}
 this.setData({status:'submitting',errorMessage:''});try{await getApp().runtime.session.changePassword({oldPassword:this.data.oldPassword,newPassword:this.data.newPassword});getApp().ready=Promise.resolve();this.setData({oldPassword:'',newPassword:'',confirmation:''});wx.reLaunch({url:'/pages/entry/index'})}catch(error){this.setData({errorMessage:error.message})}finally{this.setData({status:'ready'})}},
 async logout(){try{await getApp().runtime.session.logout()}catch(_){}finally{wx.reLaunch({url:'/pages/auth/login/index'})}},
 onUnload(){this.setData({oldPassword:'',newPassword:'',confirmation:''})},
})
