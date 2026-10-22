const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({setup(options){this.domain=options.domain;this.id=options.id;this.courseId=options.courseId;this.picking=false;this.privateFiles=[]},reset(){this.clearPrivateFiles()},keepOnShow(){return this.picking},async fetch(runtime){
 this.clearPrivateFiles();const sequence=this.sequence
 if(runtime.training&&this.courseId){const section=await runtime.training.section(this.courseId,this.domain);if(!section.items.some(row=>row.key===this.id))throw new Error('此任务不属于当前课程或已撤回')}
 if(runtime.operations&&this.domain!=='organizations'){
  const result=await runtime.operations.detail(this.domain,this.id)
  if(runtime.training&&['assignments','checkins'].includes(this.domain)){
   const own=await runtime.training.ownSubmission(this.domain,this.id,result.entity)
   if(own){
    const images=await Promise.all(own.images.map(async(image,index)=>{
     try{const url=await runtime.api.downloadAsset(typeof image==='string'?image:image.url);if(this.unloaded||sequence!==this.sequence){runtime.api.discardFile(url);return null}this.privateFiles.push(url);return {url,index}}
     catch(e){if(e.status===401||e.status===403)throw e;return {index,error:'图片暂时无法读取，请刷新重试'}}
    }))
    return {...result,ownSubmission:{...own,images:images.filter(Boolean)}}
   }
   return {...result,ownSubmission:null}
  }
  return result
 }
 const result=await runtime.domains.detail(this.domain,this.id);return {title:result.title,description:result.description,resourceStatus:result.status}
},methods:{
 clearPrivateFiles(){for(const file of this.privateFiles||[])getApp().runtime.api.discardFile(file);this.privateFiles=[]},
 async action(e){const key=e.currentTarget.dataset.key;if(!(this.data.actions||[]).some(item=>item.key===key))return;
 const views={students:'students',assignments:'assignments',checkins:'checkins',submissions:this.domain,others:this.domain,tokens:this.domain,questions:'classrooms'}
 if(views[key]){wx.navigateTo({url:'/pages/list/index?domain='+views[key]+'&parent='+encodeURIComponent(this.id)+'&view='+(['submissions','others','tokens','questions'].includes(key)?key:'')});return}
 if(['createAssignment','createCheckin','createClassroom'].includes(key)){wx.navigateTo({url:'/pages/operation/index?domain='+{createAssignment:'assignments',createCheckin:'checkins',createClassroom:'classrooms'}[key]+'&action=create&courseId='+encodeURIComponent(this.id)});return}
 if(key==='cover'){if(this.data.status==='submitting'||this.picking)return;const sequence=this.sequence;this.picking=true;try{const files=await getApp().runtime.media.chooseImages(1,()=>sequence===this.sequence&&!this.unloaded);if(sequence!==this.sequence)return;this.setData({status:'submitting'});await getApp().runtime.operations.uploadCover(this.id,files[0].tempFilePath);if(sequence===this.sequence)await this.load()}catch(error){if(sequence===this.sequence&&error.kind!=='cancelled')this.setData({status:'ready',notice:error.message||'未选择封面'})}finally{this.picking=false}return}
 if(key==='parentPolicy'){wx.navigateTo({url:'/pages/tool-policy/index?key='+encodeURIComponent(this.data.entity.identity.instrumentKey)+'&version='+encodeURIComponent(this.data.entity.identity.instrumentVersion)+'&family=SCALE'});return}
 if(key==='live'){wx.navigateTo({url:'/pages/classroom/index?id='+encodeURIComponent(this.id)});return}
 if(key==='qrcode'){wx.showModal({title:'课堂加入信息',content:'课堂码：'+(this.data.entity.code||'')+'。学生可在小程序首页的加入课堂入口输入该码。',showCancel:false});return}
 wx.navigateTo({url:'/pages/operation/index?domain='+this.domain+'&id='+encodeURIComponent(this.id)+'&action='+encodeURIComponent(key)+(this.courseId?'&courseId='+encodeURIComponent(this.courseId):'')})
 },
}}))
