const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({
 setup(options){this.domain=options.domain;this.id=options.id||undefined;this.action=options.action;this.values={};this.sealed=null;this.visible=true},
 keepOnShow(){return Boolean(this.form)},
 reset(){this.values={};this.form=null;this.sealed=null;this.visible=false;this.images=[]},
 async fetch(runtime){this.form=await runtime.operations.prepare(this.domain,this.id,this.action);this.values={};this.images=this.form.images||[];this.sealed=null;return {images:this.images,canUploadImages:this.form.canUploadImages,title:this.form.title,fields:this.form.fields,confirmation:this.form.confirmation,confirmationOpen:false,sealed:false,conflict:false,formError:'',result:null,booleanChoices:[{value:true,label:'允许'},{value:false,label:'不允许'}]}},
 methods:{
 change(event){if(this.data.status==='submitting'||this.sealed)return;const key=event.currentTarget.dataset.key;if(!this.form.fields.some(f=>f.key===key))return;this.values[key]=event.detail.value;this.setData({fields:this.form.fields.map(f=>Object.assign({},f,{value:this.values[f.key]===undefined?f.value:this.values[f.key]}))})},
 async choose(event){const key=event.currentTarget.dataset.key;const f=this.form.fields.find(f=>f.key===key);if(!f||!f.selector||this.data.status==='submitting'||this.sealed)return;wx.navigateTo({url:'/pages/select/index?domain='+encodeURIComponent(f.selector)+'&parent='+encodeURIComponent(f.selectorParent||'')+'&multiple='+(f.multiple?'1':'0'),events:{selected:selection=>{if(!this.visible)return;this.values[key]=selection.value;this.setData({fields:this.data.fields.map(item=>item.key===key?Object.assign({},item,{value:selection.value,selectionLabel:selection.label}):item)})}}})},
 confirm(){if(this.data.status==='submitting')return;this.setData({confirmationOpen:true,formError:''})},
 cancel(){if(this.data.status!=='submitting')this.setData({confirmationOpen:false})},
 async submit(){if(this.data.status==='submitting'||!this.data.confirmationOpen)return;const sequence=this.sequence;this.setData({status:'submitting',formError:''});
  // Once a submission is sent, retries retain its exact payload and key. An
  // edit requires a fresh server revision obtained by reopening the form.
  if(!this.sealed)this.sealed=JSON.parse(JSON.stringify(this.values))
  try{const result=await getApp().runtime.operations.execute(this.domain,this.id,this.action,this.form,this.sealed,{images:this.images});if(sequence!==this.sequence)return;this.setData({status:'ready',fields:[],confirmationOpen:false,result:{message:'服务器已确认操作完成',handoffFile:result&&result.handoffFile||'',code:result&&result.code||'',publicLink:result&&result.token?getApp().runtime.operations.publicLink(result.token):''}});this.values={};this.sealed=null}
  catch(error){if(sequence!==this.sequence)return;const conflict=error.status===409;if(error.kind==='invalidRequest'||(error.status>=400&&error.status<500)){this.sealed=null}this.setData({status:'ready',confirmationOpen:false,formError:error.message+(conflict?'。请返回刷新后重新操作。':'。若需重试，请保持原提交内容。'),conflict});if(!['submit'].includes(this.action)){this.sealed=null;if(error.kind==='network'||error.status>=500)this.setData({conflict:true,formError:error.message+'。服务器确认结果未知，请返回列表核对后再操作。'})}this.setData({sealed:Boolean(this.sealed)})}
 },
 async upload(){if(!this.data.canUploadImages||this.sealed||this.data.status==='submitting')return;const sequence=this.sequence;try{const chosen=await new Promise((resolve,reject)=>wx.chooseMedia({count:Math.max(1,9-this.images.length),mediaType:['image'],success:resolve,fail:reject}));if(sequence!==this.sequence||!this.visible)return;this.setData({status:'submitting',formError:''});for(const file of chosen.tempFiles){if(this.images.length>=9)break;const asset=await getApp().runtime.operations.uploadImage(this.domain,this.id,this.action,file.tempFilePath);if(sequence!==this.sequence||!this.visible)return;this.images.push(asset);this.setData({images:this.images})}this.setData({status:'ready'})}catch(e){if(sequence===this.sequence)this.setData({status:'ready',formError:e.message||'未选择图片'})}},
 removeImage(e){if(this.sealed||this.data.status==='submitting')return;this.images=this.images.filter((_,i)=>i!==Number(e.currentTarget.dataset.index));this.setData({images:this.images})},
 copyLink(){if(this.data.result&&this.data.result.publicLink)wx.setClipboardData({data:this.data.result.publicLink})},
 back(){wx.navigateBack({delta:1})},
 }}))
