import { Request, Response, NextFunction } from 'express'

export interface PaginationParams {
  page: number
  pageSize: number
  skip: number
  take: number
  /** Cursor token for the next page. Offset pagination remains the default. */
  cursor?: string
  /** Explicit cursor mode allows the first cursor page to omit a token. */
  cursorMode?: boolean
}

export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
}

export interface CursorPaginatedResult<T> {
  list: T[]
  pageSize: number
  nextCursor: string | null
  hasMore: boolean
}

/**
 * 分页参数默认值
 */
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

/**
 * 从请求中提取分页参数
 */
export const getPaginationParams = (req: Request): PaginationParams => {
  const page = Math.max(1, parseInt(req.query.page as string) || DEFAULT_PAGE)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.query.pageSize as string) || DEFAULT_PAGE_SIZE)
  )
  const hasCursorQuery =
    req.query.pagination === 'cursor' || Object.prototype.hasOwnProperty.call(req.query, 'cursor')
  const cursor = typeof req.query.cursor === 'string' && req.query.cursor.trim()
    ? req.query.cursor
    : undefined
  
  return {
    page,
    pageSize,
    // Cursor requests never calculate an offset. This keeps the query contract
    // explicit and prevents accidentally combining both pagination strategies.
    skip: hasCursorQuery ? 0 : (page - 1) * pageSize,
    take: pageSize,
    ...(hasCursorQuery ? { cursorMode: true, ...(cursor ? { cursor } : {}) } : {}),
  }
}

/**
 * 构建分页结果
 */
export const buildPaginatedResult = <T>(
  list: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> => {
  const totalPages = Math.ceil(total / params.pageSize)
  return {
    list,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
    hasMore: params.page < totalPages,
  }
}

export const buildCursorPaginatedResult = <T>(
  list: T[],
  nextCursor: string | null,
  params: PaginationParams
): CursorPaginatedResult<T> => ({
  list,
  pageSize: params.pageSize,
  nextCursor,
  hasMore: nextCursor !== null,
})

/**
 * 分页中间件 - 自动解析分页参数并附加到 req.pagination
 */
export const paginationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.pagination = getPaginationParams(req)
  next()
}

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      pagination?: PaginationParams
    }
  }
}
