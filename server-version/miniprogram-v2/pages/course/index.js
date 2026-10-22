const {workspacePage}=require('../../app/pages/index')
const tabs=[{key:'assignments',label:'练习'},{key:'checkins',label:'打卡'},{key:'assessments',label:'测评'}]
Page(workspacePage({
 setup(o){this.courseId=o.id;this.section=tabs.some(t=>t.key===o.section)?o.section:'assignments'},
 async fetch(runtime){const result=await runtime.training.section(this.courseId,this.section);return {title:result.course.title,description:result.course.description||'',tabs,section:this.section,items:result.items,errors:result.errors,empty:false}},
 methods:{
 switchSection(e){if(!tabs.some(t=>t.key===e.detail.key)||this.section===e.detail.key)return;this.section=e.detail.key;return this.load()},
 select(e){const key=e.currentTarget.dataset.key,row=this.data.items?.find(v=>v.key===key);if(!row?.href)return;const query='&courseId='+encodeURIComponent(this.courseId);wx.navigateTo({url:this.section==='assessments'?'/pages/assessment-entry/index?mode=course&id='+encodeURIComponent(key)+query:'/pages/detail/index?domain='+this.section+'&id='+encodeURIComponent(key)+query})},
 report(e){const row=this.data.items?.find(v=>v.key===e.currentTarget.dataset.key);if(!row?.reportHref)return;wx.navigateTo({url:'/pages/assessment-entry/index?mode=course&report=1&id='+encodeURIComponent(row.key)+'&courseId='+encodeURIComponent(this.courseId)})},
 home(){wx.reLaunch({url:'/pages/home/index'})},
 }}))
