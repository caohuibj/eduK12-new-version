const generic=require('../entry/index')
const {destination}=require('../router/index')
function parseEntry(input,origin){const entry=generic.parseEntry(input,origin);if(entry&&entry.kind!=='course')throw new Error('此小程序仅支持 Training 课程入口，请从课程进入学习任务');return entry}
async function resolveEntry(entry,session,training){
 if(!session.user||session.user.mustChangePassword)return {status:'login',destination:destination(session)}
 if(!entry)return {status:'home',destination:'/pages/home/index'}
 if(entry.kind!=='course')throw new Error('请从 Training 课程进入学习任务')
 await training.course(entry.id)
 return {status:'ready',destination:'/pages/course/index?id='+encodeURIComponent(entry.id)}
}
module.exports={parseEntry,resolveEntry}
