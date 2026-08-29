/**
 * 统一正则表达式定义
 * 避免在多处重复定义相同的模式
 */

// 用户名：字母、数字、下划线，3-20位
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

// 密码：至少8位，包含字母和数字
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/

// 手机号：中国大陆手机号
export const PHONE_REGEX = /^1[3-9]\d{9}$/

// 邮箱
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 日期格式：YYYY-MM-DD
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// 日期时间格式：YYYY-MM-DD HH:mm:ss
export const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

// 课程码：兼容历史 6/9 位码，并接受新的 12 位 Crockford Base32 码。
// 入口仍以数据库精确匹配为准；该正则只用于客户端/共享校验工具。
export const COURSE_CODE_REGEX = /^(?:[A-Z0-9]{6}|[A-Z0-9]{9}|[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12})$/i

// UUID 格式
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 文件扩展名
export const FILE_EXTENSION_REGEX = /\.([^.]+)$/

// 图片扩展名
export const IMAGE_EXTENSION_REGEX = /\.(jpg|jpeg|png|gif|webp)$/i

// 视频扩展名
export const VIDEO_EXTENSION_REGEX = /\.(mp4|webm|ogg|mov|qt)$/i

/**
 * 验证工具函数
 */
export const validators = {
  isValidUsername: (username: string): boolean => USERNAME_REGEX.test(username),
  isValidPassword: (password: string): boolean => PASSWORD_REGEX.test(password),
  isValidPhone: (phone: string): boolean => PHONE_REGEX.test(phone),
  isValidEmail: (email: string): boolean => EMAIL_REGEX.test(email),
  isValidCourseCode: (code: string): boolean => COURSE_CODE_REGEX.test(code),
  isValidUUID: (uuid: string): boolean => UUID_REGEX.test(uuid),
}
