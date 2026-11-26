export interface ClassroomDanmakuSettings {
  topic: string
  displayMode: 'QUESTION' | 'DANMAKU'
  reviewMode: 'review' | 'realtime'
  speed: 'slow' | 'normal' | 'fast'
}

export interface ClassroomDanmakuMessage {
  id: string
  text: string
  createdAt: string
  expiresAt: string
  status: 'pending' | 'approved'
}

export interface ClassroomDanmakuSnapshot extends ClassroomDanmakuSettings {
  available: boolean
  classroomId: string
  sessionId: string | null
  displayEpoch: number
  revision: number
  controlRevision: number
  enabled: boolean
  paused: boolean
  expiresAt: string | null
  messages: ClassroomDanmakuMessage[]
  pending?: ClassroomDanmakuMessage[]
  removedMessageIds?: string[]
  limits: {
    maxTextLength: number
    cooldownMs: number
    maxPerMinute: number
    messageTtlMs: number
    pendingTtlMs: number
  }
}

export interface ClassroomDanmakuControl {
  action: 'start' | 'configure' | 'pause' | 'resume' | 'clear' | 'stop' | 'approve' | 'hide'
  revision: number
  sessionId: string | null
  settings?: Partial<ClassroomDanmakuSettings>
  messageId?: string
}

type ClassroomDanmakuError = {
  ok: false
  code: string
  message: string
  retryAfterMs?: number
}

export type ClassroomDanmakuStateAck =
  | { ok: true; snapshot: ClassroomDanmakuSnapshot }
  | ClassroomDanmakuError

export type ClassroomDanmakuSendAck =
  | { ok: true; messageId: string; status: 'pending' | 'approved'; snapshot: ClassroomDanmakuSnapshot }
  | ClassroomDanmakuError
