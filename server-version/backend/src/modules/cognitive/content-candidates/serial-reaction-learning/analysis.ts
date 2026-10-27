import type {Config,Condition} from './protocol'
export const mean=(a:readonly number[])=>a.length?a.reduce((m,x,i)=>m+(x-m)/(i+1),0):null
export const difference=(a:number|null,b:number|null)=>a===null||b===null?null:a-b
export const rate=(a:number,b:number)=>b?a/b:null
export interface Cell{planned:number;presented:number;answered:number;firstCorrect:number;completed:number;interrupted:number;unanswered:number;correctRtMs:number|null}
export interface Counts{planned:number;presented:number;answered:number;firstCorrect:number;completed:number;interrupted:number;unanswered:number;unpresented:number;corrections:number}
export interface Run{run:number;R:Cell;S:Cell;tail:Cell;deltaMs:number|null}
export const cell=(planned:number):Cell=>({planned,presented:0,answered:0,firstCorrect:0,completed:0,interrupted:0,unanswered:0,correctRtMs:null})
export const emptyRuns=(c:Config):Run[]=>Array.from({length:c.runs},(_,run)=>({run,R:cell(40),S:cell(40),tail:cell(4),deltaMs:null}))
export type Times=Record<Condition,number[]>
