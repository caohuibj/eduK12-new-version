const { ApiError } = require('../errors/index')
const clone = value => JSON.parse(JSON.stringify(value))
const META = ['ownerId','family','attemptId','unitId','unitKind','attemptEpoch','definitionHash','contextSnapshotHash']
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
function identity(meta) {
  if (!meta || META.some(k => meta[k] === undefined) || !Number.isInteger(meta.attemptEpoch) || meta.attemptEpoch < 1 ||
      !identifier(meta.ownerId) || !identifier(meta.attemptId) || !identifier(meta.unitId) ||
      !['SCALE','QUESTIONNAIRE','COMPOSITE','SITUATIONAL'].includes(meta.family) || !['SCALE','FORM','SITUATIONAL'].includes(meta.unitKind) ||
      !/^[a-f0-9]{64}$/.test(meta.definitionHash) || (meta.contextSnapshotHash !== null && !/^[a-f0-9]{64}$/.test(meta.contextSnapshotHash))) {
    throw new ApiError('definitionMismatch','冻结测评身份不完整，请重新打开')
  }
  return JSON.stringify(META.map(k => meta[k]))
}
// This random command identifier is for retry identity, never an authorization secret.
const commandId = () => 'mini-final-' + Date.now().toString(36) + '-' + Array.from({length:4}, () => Math.random().toString(36).slice(2,10)).join('')
function createDraftStore(storage,session,epoch) {
  function guard(meta,start) { return () => {
    const user=session.get().user
    if (!user || user.id !== meta.ownerId || epoch() !== start) throw new ApiError('sessionChanged','登录状态已变化，草稿没有写入')
  } }
  const key = meta => ['assessment',meta.ownerId,meta.family,meta.attemptId,meta.unitId].map(encodeURIComponent).join(':')
  function validate(saved) {
    if (!saved || saved.schemaVersion !== 1 || saved.identity !== identity(saved.meta) ||
        !['draft','sealed'].includes(saved.state) || !saved.values || typeof saved.values !== 'object' || Array.isArray(saved.values) ||
        typeof saved.commandId !== 'string' || !/^mini-final-[A-Za-z0-9-]{16,180}$/.test(saved.commandId) ||
        (saved.state === 'sealed' && (!saved.payload || saved.payload.submissionId !== saved.commandId ||
          saved.payload.definitionHash !== saved.meta.definitionHash || saved.payload.attemptEpoch !== saved.meta.attemptEpoch ||
          (saved.payload.contextSnapshotHash || null) !== saved.meta.contextSnapshotHash))) {
      throw new ApiError('draftConflict','本机草稿不可验证，请先核对服务器状态')
    }
    return saved
  }
  return {
    async open(meta) {
      const exact=identity(meta), start=epoch(), check=guard(meta,start);check()
      const saved=await storage.readDraft(key(meta));check()
      if (saved) {validate(saved);if (saved.identity !== exact) throw new ApiError('draftConflict','本机草稿对应旧轮次或其他定义，请先核对服务器状态');return clone(saved)}
      return {schemaVersion:1,identity:exact,meta:clone(meta),state:'draft',values:{},payload:null,commandId:commandId(),updatedAt:new Date().toISOString()}
    },
    async pending(ownerId,family,attemptId) {
      const start=epoch(), check=guard({ownerId},start);check()
      const rows=await storage.listDrafts();check()
      const matches=[]
      for (const row of rows) {
        if (!row.key.startsWith(['assessment',ownerId,family,attemptId].map(encodeURIComponent).join(':')+':')) continue
        const saved=validate(row.value)
        if (key(saved.meta)!==row.key || saved.meta.ownerId!==ownerId || saved.meta.family!==family || saved.meta.attemptId!==attemptId) throw new ApiError('draftConflict','本机草稿绑定无法验证')
        if (saved.state==='sealed') matches.push(clone(saved))
      }
      if (matches.length>1) throw new ApiError('draftConflict','存在多份待确认提交，请在正式网页核对状态')
      return matches[0] || null
    },
    async save(meta,draft) {
      if (draft.identity!==identity(meta)) throw new ApiError('draftConflict','草稿身份已变化')
      const value=clone(draft);value.updatedAt=new Date().toISOString();validate(value)
      await storage.writeDraft(key(meta),value,guard(meta,epoch()));return value
    },
    async change(meta,draft,itemKey,value) {
      if (draft.state!=='draft') throw new ApiError('sealed','答案已封存，只能重试同一提交')
      if (typeof itemKey!=='string' || ['__proto__','constructor','prototype'].includes(itemKey)) throw new ApiError('invalidRequest','题目标识无效')
      const next=clone(draft);Object.defineProperty(next.values,itemKey,{value:clone(value),enumerable:true,writable:true,configurable:true});return this.save(meta,next)
    },
    async seal(meta,draft,payload) {
      if (draft.state==='sealed') return clone(validate(draft))
      if (payload.submissionId!==draft.commandId) throw new ApiError('invalidRequest','提交标识无效')
      const next=clone(draft);next.state='sealed';next.payload=clone(payload);return this.save(meta,next)
    },
    async discardStale(meta){const start=epoch(),check=guard(meta,start);check();const saved=await storage.readDraft(key(meta));check();if(!saved)return;validate(saved);if(saved.identity===identity(meta))throw new ApiError('conflict','当前草稿身份仍有效，不能清理');await storage.removeDraft(key(meta),check)},
    async remove(meta) {identity(meta);await storage.removeDraft(key(meta),guard(meta,epoch()))},
  }
}
module.exports={createDraftStore,identity}
