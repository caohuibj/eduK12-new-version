Page({
 data:{kind:'student',tabs:[{key:'student',label:'学生注册'},{key:'teacher',label:'教师注册'}],username:'',password:'',nickname:'',code:'',status:'ready',errorMessage:'',done:false},
 change(event){const key=event.currentTarget.dataset.field;if(['username','password','nickname','code'].includes(key))this.setData({[key]:event.detail.value})},
 select(event){if(this.data.status==='submitting')return;if(['student','teacher'].includes(event.detail.key))this.setData({kind:event.detail.key,code:'',errorMessage:''})},
 async submit(){
  if(this.data.status==='submitting')return
  const {kind,username,password,nickname,code}=this.data
  if(!username.trim()||!password||!nickname.trim()||!code.trim()){this.setData({errorMessage:'请填写所有信息'});return}
  this.setData({status:'submitting',errorMessage:''})
  try{
   const values={username:username.trim(),password,nickname:nickname.trim()};values[kind==='student'?'courseCode':'teacherCode']=code.trim()
   await getApp().runtime.account.register(kind,values);this.setData({done:true,password:'',code:''})
  }catch(error){this.setData({errorMessage:error.message})}finally{this.setData({status:'ready'})}
 },
 login(){wx.reLaunch({url:'/pages/auth/login/index'})},
 onUnload(){this.setData({password:'',code:''})},
})
