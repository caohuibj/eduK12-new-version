const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({setup(options){this.domain=options.domain;this.id=options.id},async fetch(runtime){if(runtime.operations&&this.domain!=='organizations')return runtime.operations.detail(this.domain,this.id);const result=await runtime.domains.detail(this.domain,this.id);return {title:result.title,description:result.description,resourceStatus:result.status}},methods:{
 async action(e){const key=e.currentTarget.dataset.key;if(!(this.data.actions||[]).some(item=>item.key===key))return;
 const views={students:'students',assignments:'assignments',checkins:'checkins',submissions:this.domain,others:this.domain,tokens:this.domain,questions:'classrooms'}
 if(views[key]){wx.navigateTo({url:'/pages/list/index?domain='+views[key]+'&parent='+encodeURIComponent(this.id)+'&view='+(['submissions','others','tokens','questions'].includes(key)?key:'')});return}
 if(['createAssignment','createCheckin','createClassroom'].includes(key)){wx.navigateTo({url:'/pages/operation/index?domain='+{createAssignment:'assignments',createCheckin:'checkins',createClassroom:'classrooms'}[key]+'&action=create'});return}
 if(key==='cover'){if(this.data.status==='submitting')return;const sequence=this.sequence;try{const chosen=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],success:resolve,fail:reject}));if(sequence!==this.sequence)return;this.setData({status:'submitting'});await getApp().runtime.operations.uploadCover(this.id,chosen.tempFiles[0].tempFilePath);if(sequence===this.sequence)await this.load()}catch(error){if(sequence===this.sequence)this.setData({status:'ready',notice:error.message||'未选择封面'})}return}
 if(key==='parentPolicy'){wx.navigateTo({url:'/pages/tool-policy/index?key='+encodeURIComponent(this.data.entity.identity.instrumentKey)+'&version='+encodeURIComponent(this.data.entity.identity.instrumentVersion)+'&family=SCALE'});return}
 if(key==='live'){wx.navigateTo({url:'/pages/classroom/index?id='+encodeURIComponent(this.id)});return}
 if(key==='qrcode'){wx.showModal({title:'课堂加入信息',content:'课堂码：'+(this.data.entity.code||'')+'。学生可在小程序首页的加入课堂入口输入该码。',showCancel:false});return}
 wx.navigateTo({url:'/pages/operation/index?domain='+this.domain+'&id='+encodeURIComponent(this.id)+'&action='+encodeURIComponent(key)})
 },
}}))
