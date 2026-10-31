import {z} from 'zod'
const base={endowment:z.number().int().positive(),interrupted:z.boolean()}
export const sharegameV2TrialSchema=z.discriminatedUnion('response',[
 z.object({...base,response:z.literal('choice'),given:z.number().int().min(0),rtMs:z.number().int().min(0)}).strict(),
 z.object({...base,response:z.enum(['timeout','omitted']),given:z.null(),rtMs:z.null()}).strict(),
]).refine(x=>x.given===null||x.given<=x.endowment,{path:['given'],message:'given exceeds endowment'})
export type SharegameV2Trial= z.infer<typeof sharegameV2TrialSchema>
