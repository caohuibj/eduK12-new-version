import { z } from 'zod'

const numeric = (max: number, fallback: number) => z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().min(1).max(max)).default(fallback)
const date = z.string().datetime({ offset: true }).optional()
export const catalogFilterSchema = z.object({
  search: z.string().trim().max(200).default(''),
  tags: z.string().max(209).default('').transform(value => [...new Set(value.split(/[,，]/).map(v => v.trim()).filter(Boolean))]).pipe(z.array(z.string().max(20)).max(10)),
  from: date, to: date,
  dateField: z.enum(['created', 'deadline']).default('created'),
  page: numeric(500,1),
  pageSize: numeric(50,20),
}).refine(value => !value.from || !value.to || Date.parse(value.from) < Date.parse(value.to), '结束日期须晚于开始日期')
export const parseCatalogFilters = (raw: unknown) => catalogFilterSchema.parse(raw)
export type CatalogFilters = ReturnType<typeof parseCatalogFilters>
export function metadataWhere(filters: CatalogFilters, titleField = 'title', deadlineField?: string) {
  if (filters.dateField === 'deadline' && !deadlineField) throw new Error('此清单仅支持创建时间')
  return {
    ...(filters.search ? { [titleField]: { contains: filters.search, mode: 'insensitive' } } : {}),
    ...(filters.tags.length ? { tags: { hasEvery: filters.tags } } : {}),
    ...(filters.from || filters.to ? { [filters.dateField === 'deadline' ? deadlineField! : 'createdAt']: {
      ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lt: new Date(filters.to) } : {}),
    } } : {}),
  }
}
export const sqlLike = (value: string) => '%' + value.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%'
