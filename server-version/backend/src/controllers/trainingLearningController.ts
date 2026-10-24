import type { Request, Response } from 'express';
import { z } from 'zod';
import { listTrainingLearningInbox } from '../services/trainingLearningInbox';
import { error, success } from '../utils/response';
const querySchema = z.object({ view: z.enum(['todo', 'feedback']).default('todo'), kind: z.enum(['ALL', 'ASSIGNMENT', 'CHECKIN', 'ASSESSMENT']).default('ALL'), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(6) }).strict();
export async function trainingLearningInbox(req: Request, res: Response) {
    const query = querySchema.safeParse(req.query);
    if (!query.success)
        return error(res, '请检查任务分类与页码', -1, 400);
    res.setHeader('Cache-Control', 'no-store');
    try {
        return success(res, await listTrainingLearningInbox(req.user!.userId, query.data));
    }
    catch {
        return error(res, '学习概览暂时无法读取，请重试', -1, 503);
    }
}
