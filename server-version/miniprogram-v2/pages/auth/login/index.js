Page({
 data:{username:'',password:'',errorMessage:'',status:'ready'},
 change(event){const key=event.currentTarget.dataset.field;if(['username','password'].includes(key))this.setData({[key]:event.detail.value})},
 async submit(){
  if(this.closed||this.data.status==='submitting')return
  if(!this.data.username.trim()||!this.data.password){this.setData({errorMessage:'请输入账号和密码'});return}
  this.setData({status:'submitting',errorMessage:''})
  try{await getApp().runtime.session.login({username:this.data.username.trim(),password:this.data.password});if(this.closed)return;getApp().ready=Promise.resolve();this.setData({password:''});wx.reLaunch({url:'/pages/entry/index'})}
  catch(error){if(!this.closed)this.setData({errorMessage:error.status===401?'账号或密码不正确':error.message})}
  finally{if(!this.closed)this.setData({status:'ready'})}
 },
 register(){wx.navigateTo({url:'/pages/auth/register/index'})},
 onUnload(){this.closed=true;this.setData({password:''})},
})
