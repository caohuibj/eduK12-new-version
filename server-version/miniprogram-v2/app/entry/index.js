const { ApiError } = require('../../core/errors/index')
const KINDS = ['course','assessment','questionnaire','composite','cognitive','situational','public','anonymous','classroom','checkin']
function parseEntry(input, origin) {
  let query = input || {}
  try {
    if (query.q || query.scene) {
      let raw = query.q || query.scene
      if (typeof raw !== 'string' || raw.length > 2048) throw new Error()
      raw = decodeURIComponent(raw)
      if (raw.startsWith('https://')) {
        if (!raw.startsWith(origin + '/')) throw new Error()
        const parts = raw.slice(origin.length).split('?')
        const canonicalCourse = parts[0].match(/^\/student\/courses\/([a-zA-Z0-9_-]{1,128})$/)
        if (canonicalCourse && !parts[1]) return {kind:'course',id:canonicalCourse[1],requiresAuth:true}
        const canonicalClassroom=parts[0]==='/student/classroom/enter'&&parts[1]&&parts[1].match(/^code=(\d{6})$/)
        if(canonicalClassroom)return {kind:'classroom',id:canonicalClassroom[1],requiresAuth:true}
        const canonicalPublic = parts[0].match(/^\/public\/(questionnaire|composite|checkin)\/([a-zA-Z0-9_-]{16,512})$/)
        if (canonicalPublic && !parts[1]) return {kind:'public',token:canonicalPublic[2],resourceFamily:canonicalPublic[1],requiresAuth:false}
        const study=parts[0].match(/^\/public\/studies\/([A-Za-z0-9_-]{1,128})$/),wave=parts[0].match(/^\/public\/studies\/waves\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{16,512})$/)
        if(!parts[1]&&(study||wave))return {kind:'anonymous',webTarget:parts[0],requiresAuth:false}
        const cognitivePublic=parts[0].match(/^\/public\/cognitive\/assignments\/([A-Za-z0-9_-]{16,512})$/)
        if(cognitivePublic&&!parts[1])return {kind:'public',webTarget:parts[0],requiresAuth:false}
        if (!['/mini/entry','/pages/entry/index'].includes(parts[0])) throw new Error()
        raw = parts[1] || ''
      }
      query = {}
      for (const pair of raw.split('&')) {
        const index = pair.indexOf('=')
        if (index < 1) throw new Error()
        const key = decodeURIComponent(pair.slice(0,index)); const value = decodeURIComponent(pair.slice(index+1))
        if (!['kind','id','token'].includes(key) || Object.prototype.hasOwnProperty.call(query,key)) throw new Error()
        query[key] = value
      }
    }
    if (!query.kind) return null
    if (!KINDS.includes(query.kind)) throw new Error()
    const isPublic = ['public','anonymous'].includes(query.kind)
    if (isPublic) {
      if (typeof query.token !== 'string' || !/^[a-zA-Z0-9_-]{16,512}$/.test(query.token)) throw new Error()
      return {kind:query.kind, token:query.token, requiresAuth:false}
    }
    if (typeof query.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(query.id)) throw new Error()
    return {kind:query.kind,id:query.id,requiresAuth:true}
  } catch (_) { throw new ApiError('invalidEntry','链接或二维码无效，请重新获取') }
}
async function resolveEntry(entry, session, domains) {
  if(entry&&['anonymous','public'].includes(entry.kind)&&entry.webTarget){require('../../domains/assessments/web-runtime').path(entry.webTarget);return {status:'ready',destination:'/pages/web-runtime/index?path='+encodeURIComponent(entry.webTarget)}}
  if (!entry) return {status:'home', destination:'/pages/home/index'}
  if(entry.kind==='public'&&['questionnaire','composite'].includes(entry.resourceFamily))return {status:'ready',destination:'/pages/web-runtime/index?path='+encodeURIComponent('/public/'+entry.resourceFamily+'/'+entry.token)}
  if(entry.kind==='public'&&entry.resourceFamily==='checkin')return {status:'ready',destination:'/pages/public-checkin/index?token='+encodeURIComponent(entry.token)}
  if (entry.requiresAuth && !session.user) return {status:'login',destination:'/pages/auth/login/index'}
  if (session.user && session.user.mustChangePassword) return {status:'password', destination:'/pages/auth/password/index'}
  if (entry.kind === 'course') {
    await domains.detail('courses',entry.id)
    return {status:'ready', destination:'/pages/detail/index?domain=courses&id='+encodeURIComponent(entry.id)}
  }
  if(entry.kind==='checkin'){await domains.operations.detail('checkins',entry.id);return {status:'ready',destination:'/pages/detail/index?domain=checkins&id='+encodeURIComponent(entry.id)}}
  if(entry.kind==='classroom'&&/^\d{6}$/.test(entry.id)){if(!session.capabilities.canJoinClassroom)throw new ApiError('forbidden','课堂入口未开放');return {status:'ready',destination:'/pages/classroom/index?code='+encodeURIComponent(entry.id)}}
  if(['assessment','questionnaire','composite','cognitive','situational'].includes(entry.kind)&&domains.assessmentEntry){const taskId=await domains.assessmentEntry(entry.kind,entry.id);return {status:'ready',destination:'/pages/assessment-entry/index?id='+encodeURIComponent(taskId)}}
  // All kinds are recognized centrally. Unsupported adapters never fabricate authorization/publication or open arbitrary Web URLs.
  return {status:'unavailable', message:'此入口的小程序适配尚未开放，请使用当前 Web 客户端。'}
}
module.exports = { KINDS, parseEntry, resolveEntry }
