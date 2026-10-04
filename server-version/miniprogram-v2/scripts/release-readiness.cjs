const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'..')
const {canonicalOrigin}=require('../core/config/index')
function checkReleaseConfig(project,environment) {
 const errors=[]
 if(!/^wx[a-f0-9]{16}$/i.test(project.appid||''))errors.push('project.config.json 需要正式 AppID，不能使用 touristappid')
 if(project.setting?.urlCheck!==true)errors.push('正式上传必须保持 setting.urlCheck=true')
 const validOrigin=value=>typeof value==='string'&&/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)&&!/^https:\/\/(?:localhost|\d+(?:\.\d+){3})(?::\d+)?$/i.test(value)&&!/\.(?:invalid|test|example)(?::\d+)?$/.test(value)
 for(const channel of ['develop','trial','release']) {
  const origin=canonicalOrigin(environment.origins?.[channel])
  if(!validOrigin(origin))errors.push(channel+' 需要明确的 HTTPS 服务地址')
  else if(channel!=='release'&&origin===canonicalOrigin(environment.origins?.release))errors.push(channel+' 不能连接 release 的正式服务')
 }
 const v=String(project.libVersion||'').split('.').map(Number),min=[2,32,3]
 if(v.length!==3||v.some(n=>!Number.isInteger(n))||v[0]<min[0]||v[0]===min[0]&&(v[1]<min[1]||v[1]===min[1]&&v[2]<min[2]))errors.push('libVersion 至少为 2.32.3，以支持隐私授权接口')
 for(const [type,value] of [['folder','tests'],['folder','scripts'],['file','project.private.config.json']]) {
  if(!(project.packOptions?.ignore||[]).some(rule=>rule.type===type&&rule.value===value))errors.push('上传包需要排除 '+value)
 }
 return errors
}
function sourceFootprint(directory,project) {
 const ignores=project.packOptions?.ignore||[],files=[]
 function visit(relative) {
  for(const item of fs.readdirSync(path.join(directory,relative),{withFileTypes:true})) {
   const name=path.posix.join(relative,item.name)
   if(item.name.startsWith('.')||ignores.some(rule=>rule.type==='folder'&&(name===rule.value||name.startsWith(rule.value+'/'))||rule.type==='file'&&name===rule.value))continue
   if(item.isSymbolicLink())throw new Error('上传源码不能包含符号链接：'+name)
   if(item.isDirectory())visit(name)
   else if(item.isFile())files.push(name)
  }
 }
 visit('')
 return {files,bytes:files.reduce((sum,name)=>sum+fs.statSync(path.join(directory,name)).size,0)}
}
if(require.main===module) {
 const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8')),environment=require('../core/config/environment'),errors=checkReleaseConfig(project,environment)
 if(errors.length){console.error('上传前配置检查未通过：\n'+errors.map(e=>' - '+e).join('\n'));process.exitCode=1}
 else {
  for(const args of [['scripts/check.cjs'],['scripts/feature-inventory.cjs','--check'],['--test',...fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>'tests/'+n)]]) {
   const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'})
   if(result.status!==0){process.exit(result.status||1)}
  }
  const size=sourceFootprint(root,project)
  console.log('源码检查通过：'+size.files.length+' 个上传资源，'+size.bytes+' 字节。实际编译包大小以微信开发者工具为准。')
  console.log('此结果不确认微信主体/类目/备案、域名、隐私后台配置、编译或真机验收；全部完成后再提交审核。')
 }
}
module.exports={checkReleaseConfig,sourceFootprint}
