import {z} from 'zod'
import {embeddedfiguresConfigSchema} from './embeddedfigures.config'
import {EMBEDDEDFIGURES_V2_STIMULUS} from '../tasks/embeddedfigures/generator.v2'
export const embeddedfiguresV2ConfigSchema=embeddedfiguresConfigSchema.extend({stimulusSetVersion:z.literal(EMBEDDEDFIGURES_V2_STIMULUS)})
 .refine(c=>c.validRtFloorMs<c.timeoutMs,'valid RT floor must precede the response deadline')
