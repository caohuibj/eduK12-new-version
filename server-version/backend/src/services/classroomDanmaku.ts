import { createHash, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { z } from 'zod';
import { getRedisUrl } from '../config/redis';
export const DANMAKU_LIMITS = { maxTextLength: 60, cooldownMs: 3000, maxPerMinute: 10, messageTtlMs: 30000, pendingTtlMs: 300000 } as const;
export type DanmakuRole = 'teacher' | 'bigscreen' | 'student';
export type DanmakuSettings = {
    topic: string;
    displayMode: 'QUESTION' | 'DANMAKU';
    reviewMode: 'review' | 'realtime';
    speed: 'slow' | 'normal' | 'fast';
};
export type DanmakuMessage = {
    id: string;
    text: string;
    createdAt: string;
    expiresAt: string;
    status: 'pending' | 'approved';
};
export type DanmakuSnapshot = DanmakuSettings & {
    available: boolean;
    classroomId: string;
    sessionId: string | null;
    revision: number;
    controlRevision: number;
    displayEpoch: number;
    enabled: boolean;
    paused: boolean;
    expiresAt: string | null;
    messages: DanmakuMessage[];
    pending?: DanmakuMessage[];
    limits: typeof DANMAKU_LIMITS;
};
export class DanmakuError extends Error {
    constructor(readonly code: string, message: string, readonly retryAfterMs?: number) { super(message); }
}
export type DanmakuRedis = {
    eval: (script: string, options: {
        keys: string[];
        arguments: string[];
    }) => Promise<unknown>;
};
const settings = z.object({ topic: z.string().trim().max(80), displayMode: z.enum(['QUESTION', 'DANMAKU']), reviewMode: z.enum(['review', 'realtime']), speed: z.enum(['slow', 'normal', 'fast']) }).partial().strict();
export const danmakuControlSchema = z.object({ action: z.enum(['start', 'configure', 'pause', 'resume', 'clear', 'stop', 'approve', 'hide']), revision: z.number().int().nonnegative(), sessionId: z.string().uuid().nullable(), settings: settings.optional(), messageId: z.string().uuid().optional() }).strict();
const sendSchema = z.object({ sessionId: z.string().uuid(), clientMessageId: z.string().uuid(), text: z.string().max(240) }).strict();
const names: Record<string, string> = { CONFLICT: '弹幕状态已变化，请刷新后操作', STOPPED: '弹幕尚未开启或已停止', RATE_LIMIT: '发送过于频繁，请稍后再试', QUEUE_FULL: '待审核弹幕已满，请稍后再试', NOT_FOUND: '这条弹幕已移除或过期', INVALID: '弹幕参数不合法', UNAVAILABLE: '弹幕缓存暂不可用，请稍后再试', CLASSROOM_CLOSED: '课堂已结束' };
// Every state, dedup and sender budget key shares a Redis cluster hash slot.
// One script serializes commands, moderation and student admission across API nodes.
export const DANMAKU_SCRIPT = `
local stamp=redis.call('TIME')
local now=tonumber(stamp[1])*1000+math.floor(tonumber(stamp[2])/1000)
local input=cjson.decode(ARGV[1])
local raw=redis.call('GET',KEYS[1])
local state=raw and cjson.decode(raw) or {sessionId=cjson.null,revision=0,controlRevision=0,displayEpoch=now,enabled=false,paused=false,displayMode='QUESTION',reviewMode='realtime',topic='',speed='normal',expiresAt=cjson.null,messages={},pending={}}
state.messages=raw and cjson.decode(redis.call('GET',KEYS[5]) or '[]') or {}
state.pending=raw and cjson.decode(redis.call('GET',KEYS[6]) or '[]') or {}
local changed=not raw
local function epoch() state.displayEpoch=math.max(now,state.displayEpoch+1) end
local function stop()
 state.enabled=false;state.paused=false;state.displayMode='QUESTION';state.sessionId=cjson.null;state.expiresAt=cjson.null;state.messages={};state.pending={};epoch()
 state.controlRevision=state.controlRevision+1;state.revision=state.revision+1;changed=true
end
if state.enabled and type(state.expiresAt)=='number' and state.expiresAt<=now then stop() end
for _,field in ipairs({'messages','pending'}) do
 local retained={}
 for _,message in ipairs(state[field]) do if message.expiresAt>now then table.insert(retained,message) end end
 if #retained~=#state[field] then state[field]=retained;state.revision=state.revision+1;changed=true end
end
local function save()
 if changed then
  local ttl=7200000
  if state.enabled then ttl=math.max(1,state.expiresAt-now) end
  local messages,pending=state.messages,state.pending
  state.messages=nil;state.pending=nil
  redis.call('SET',KEYS[1],cjson.encode(state),'PX',ttl)
  state.messages=messages;state.pending=pending
  for index,field in ipairs({'messages','pending'}) do
   local latest=0
   for _,message in ipairs(state[field]) do latest=math.max(latest,message.expiresAt) end
   if latest>now then redis.call('SET',KEYS[4+index],cjson.encode(state[field]),'PX',latest-now) else redis.call('DEL',KEYS[4+index]) end
  end
 end
end
local function result(extra)
 save();extra=extra or {};extra.ok=true;extra.snapshot=state;return cjson.encode(extra)
end
local function failure(code,retry)
 save();return cjson.encode({ok=false,code=code,retryAfterMs=retry})
end
if input.operation=='read' then return result() end
if input.operation=='close' then
 if state.enabled or #state.messages>0 or #state.pending>0 then stop() end
 state.closed=true;changed=true
 return result()
end
if input.operation=='control' then
 if state.closed then return failure('CLASSROOM_CLOSED') end
 local action=input.action
 if action~='approve' and action~='hide' and input.revision~=state.controlRevision then return failure('CONFLICT') end
 if input.sessionId~=state.sessionId then return failure('CONFLICT') end
 if action=='start' then
  if state.enabled then return failure('CONFLICT') end
  state.sessionId=input.newSessionId;state.enabled=true;state.paused=false;state.messages={};state.pending={};state.expiresAt=now+7200000;epoch()
  state.reviewMode='realtime'
 elseif not state.enabled then return failure('STOPPED') end
 if action=='stop' then stop();return result() end
 if action=='configure' or action=='start' then
  for key,value in pairs(input.settings or {}) do state[key]=value end
 elseif action=='pause' then state.paused=true
 elseif action=='resume' then state.paused=false
 elseif action=='clear' then state.messages={};state.pending={};epoch()
 elseif action=='approve' then
  local found=nil
  for index,message in ipairs(state.pending) do if message.id==input.messageId then found=table.remove(state.pending,index);break end end
  if not found then
   for _,message in ipairs(state.messages) do if message.id==input.messageId then return result() end end
   return failure('NOT_FOUND')
  end
  found.status='approved';found.createdAt=now;found.expiresAt=math.min(state.expiresAt,now+30000);table.insert(state.messages,found)
  while #state.messages>100 do table.remove(state.messages,1) end
 elseif action=='hide' then
  local found=false
  for _,field in ipairs({'messages','pending'}) do
   for index=#state[field],1,-1 do if state[field][index].id==input.messageId then table.remove(state[field],index);found=true end end
  end
  if not found then return failure('NOT_FOUND') end
 end
 if action~='approve' and action~='hide' then state.controlRevision=state.controlRevision+1 end
 state.revision=state.revision+1;changed=true;return result()
end
if input.operation=='send' then
 if not state.enabled then return failure('STOPPED') end
 if input.sessionId~=state.sessionId then return failure('CONFLICT') end
 local duplicate=redis.call('GET',KEYS[2])
 if duplicate then
  local previous=cjson.decode(duplicate)
  if previous.digest~=input.digest then return failure('CONFLICT') end
  return result({messageId=previous.messageId,status=previous.status,replayed=true})
 end
 local wait=redis.call('PTTL',KEYS[3])
 if wait>0 then return failure('RATE_LIMIT',wait) end
 redis.call('ZREMRANGEBYSCORE',KEYS[4],'-inf',now-60000)
 if redis.call('ZCARD',KEYS[4])>=10 then
  local oldest=redis.call('ZRANGE',KEYS[4],0,0,'WITHSCORES')
  return failure('RATE_LIMIT',math.max(1,tonumber(oldest[2])+60000-now))
 end
 if state.reviewMode=='review' and #state.pending>=100 then return failure('QUEUE_FULL') end
 local status=state.reviewMode=='review' and 'pending' or 'approved'
 local message={id=input.messageId,text=input.text,status=status,createdAt=now,expiresAt=math.min(state.expiresAt,now+(status=='pending' and 300000 or 30000))}
 table.insert(state[status=='pending' and 'pending' or 'messages'],message)
 while #state.messages>100 do table.remove(state.messages,1) end
 redis.call('SET',KEYS[3],'1','PX',3000)
 redis.call('ZADD',KEYS[4],now,input.clientMessageId);redis.call('PEXPIRE',KEYS[4],60000)
 redis.call('SET',KEYS[2],cjson.encode({digest=input.digest,messageId=input.messageId,status=status}),'PX',300000)
 state.revision=state.revision+1;changed=true
 return result({messageId=input.messageId,status=status,replayed=false})
end
return failure('INVALID')
`;
let connection: ReturnType<typeof createClient> | null = null;
let connecting: Promise<DanmakuRedis> | null = null, nextConnectAt = 0;
async function defaultRedis(): Promise<DanmakuRedis> {
    if (connection?.isReady)
        return { eval: async (script, options) => connection!.eval(script, options) };
    if (connecting)
        return connecting;
    if (Date.now() < nextConnectAt)
        throw new DanmakuError('UNAVAILABLE', names.UNAVAILABLE);
    connecting = (async () => {
        const client = createClient({ url: getRedisUrl(), disableOfflineQueue: true, commandsQueueMaxLength: 100, socket: { connectTimeout: 1000, reconnectStrategy: false } });
        client.on('error', () => { });
        try {
            await client.connect();
            connection = client;
            return { eval: async (script: string, options: {
                    keys: string[];
                    arguments: string[];
                }) => client.eval(script, options) };
        }
        catch {
            nextConnectAt = Date.now() + 5000;
            if (client.isOpen)
                client.destroy();
            throw new DanmakuError('UNAVAILABLE', names.UNAVAILABLE);
        }
    })().finally(() => { connecting = null; });
    return connecting;
}
const validKey = (value: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export class ClassroomDanmakuStore {
    constructor(private readonly redis: () => Promise<DanmakuRedis> = defaultRedis) { }
    private readonly versions = new Map<string, Pick<DanmakuSnapshot, 'sessionId' | 'revision' | 'controlRevision' | 'displayEpoch'>>();
    unavailable(classroomId: string): DanmakuSnapshot { return { ...this.versions.get(classroomId), available: false, classroomId, sessionId: this.versions.get(classroomId)?.sessionId ?? null, revision: this.versions.get(classroomId)?.revision ?? 0, controlRevision: this.versions.get(classroomId)?.controlRevision ?? 0, displayEpoch: this.versions.get(classroomId)?.displayEpoch ?? 0, enabled: false, paused: false, displayMode: 'QUESTION', reviewMode: 'realtime', topic: '', speed: 'normal', expiresAt: null, messages: [], limits: DANMAKU_LIMITS }; }
    private async perform(classroomId: string, input: Record<string, unknown>, senderSession = 'reader') {
        if (!validKey(classroomId) || !validKey(senderSession))
            throw new DanmakuError('INVALID', names.INVALID);
        const prefix = 'classroom-danmaku:v1:{' + classroomId + '}';
        const senderKey = senderSession + ':' + (input.sessionId ?? 'none');
        let timer: NodeJS.Timeout | undefined;
        try {
            const work = (async () => { const client = await this.redis(); return client.eval(DANMAKU_SCRIPT, { keys: [prefix, prefix + ':dedup:' + senderKey + ':' + (input.clientMessageId ?? 'none'), prefix + ':cooldown:' + senderKey, prefix + ':rate:' + senderKey, prefix + ':messages', prefix + ':pending'], arguments: [JSON.stringify(input)] }); })();
            const reply = await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DanmakuError('UNAVAILABLE', names.UNAVAILABLE)), 1500); timer.unref?.(); })]);
            const result = JSON.parse(String(reply)) as {
                ok: boolean;
                code?: string;
                retryAfterMs?: number;
                snapshot: Record<string, any>;
                messageId?: string;
                status?: 'pending' | 'approved';
                replayed?: boolean;
            };
            if (!result.ok)
                throw new DanmakuError(result.code ?? 'INVALID', names[result.code ?? 'INVALID'] ?? names.INVALID, result.retryAfterMs);
            const raw = result.snapshot;
            const messages = (value: unknown): DanmakuMessage[] => Array.isArray(value) ? value.map(message => ({ ...message, createdAt: new Date(message.createdAt).toISOString(), expiresAt: new Date(message.expiresAt).toISOString() })) : [];
            const snapshot: DanmakuSnapshot = { ...raw, available: true, classroomId, expiresAt: typeof raw.expiresAt === 'number' ? new Date(raw.expiresAt).toISOString() : null, messages: messages(raw.messages), pending: messages(raw.pending), limits: DANMAKU_LIMITS } as DanmakuSnapshot;
            this.versions.delete(classroomId);
            this.versions.set(classroomId, { sessionId: snapshot.sessionId, revision: snapshot.revision, controlRevision: snapshot.controlRevision, displayEpoch: snapshot.displayEpoch });
            if (this.versions.size > 200)
                this.versions.delete(this.versions.keys().next().value!);
            return { ...result, snapshot };
        }
        catch (cause) {
            if (cause instanceof DanmakuError)
                throw cause;
            throw new DanmakuError('UNAVAILABLE', names.UNAVAILABLE);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    read(classroomId: string) { return this.perform(classroomId, { operation: 'read' }); }
    close(classroomId: string) { return this.perform(classroomId, { operation: 'close' }); }
    control(classroomId: string, input: unknown) {
        const parsed = danmakuControlSchema.safeParse(input);
        if (!parsed.success || (['approve', 'hide'].includes(parsed.data.action) && !parsed.data.messageId))
            throw new DanmakuError('INVALID', names.INVALID);
        return this.perform(classroomId, { ...parsed.data, operation: 'control', newSessionId: randomUUID() });
    }
    send(classroomId: string, senderSession: string, input: unknown) {
        const parsed = sendSchema.safeParse(input);
        if (!parsed.success)
            throw new DanmakuError('INVALID', names.INVALID);
        const text = parsed.data.text.trim().replace(/\s+/gu, ' ');
        if (!text || Array.from(text).length > 60 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))
            throw new DanmakuError('INVALID', names.INVALID);
        return this.perform(classroomId, { ...parsed.data, text, operation: 'send', messageId: randomUUID(), digest: createHash('sha256').update(text).digest('hex') }, senderSession);
    }
}
export function danmakuForRole(snapshot: DanmakuSnapshot, role: DanmakuRole): DanmakuSnapshot {
    const { pending, ...publicState } = snapshot;
    if (role === 'teacher')
        return { ...publicState, pending: pending ?? [] };
    return { ...publicState, messages: role === 'bigscreen' ? snapshot.messages : [] };
}
export const classroomDanmaku = new ClassroomDanmakuStore();
