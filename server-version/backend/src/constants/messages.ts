/**
 * 统一错误和成功消息定义
 * 避免硬编码消息字符串
 */

export const Messages = {
  // 通用消息
  COMMON: {
    SUCCESS: '操作成功',
    FAILED: '操作失败',
    NOT_FOUND: '资源不存在',
    UNAUTHORIZED: '未授权访问',
    FORBIDDEN: '权限不足',
    INVALID_PARAMS: '参数错误',
    SERVER_ERROR: '服务器内部错误',
  },

  // 用户相关
  USER: {
    LOGIN_SUCCESS: '登录成功',
    LOGIN_FAILED: '登录失败',
    LOGOUT_SUCCESS: '退出成功',
    REGISTER_SUCCESS: '注册成功',
    USER_NOT_FOUND: '用户不存在',
    PASSWORD_ERROR: '密码错误',
    PASSWORD_CHANGED: '密码修改成功',
    PASSWORD_RESET: '密码已重置',
    ACCOUNT_FROZEN: '账号已被冻结',
    ACCOUNT_EXPIRED: '账号已过期',
    ACCOUNT_EXTENDED: '账号已延期',
  },

  // 课程相关
  COURSE: {
    CREATE_SUCCESS: '课程创建成功',
    UPDATE_SUCCESS: '课程更新成功',
    DELETE_SUCCESS: '课程删除成功',
    END_SUCCESS: '课程已结束',
    NOT_FOUND: '课程不存在',
    CODE_INVALID: '课程码无效',
    JOIN_SUCCESS: '加入课程成功',
    JOIN_PENDING: '申请已提交，等待审核',
    LEAVE_SUCCESS: '已退出课程',
    ALREADY_JOINED: '已加入该课程',
  },

  // 作业相关
  ASSIGNMENT: {
    CREATE_SUCCESS: '作业发布成功',
    UPDATE_SUCCESS: '作业更新成功',
    DELETE_SUCCESS: '作业删除成功',
    SUBMIT_SUCCESS: '作业提交成功',
    GRADE_SUCCESS: '批改成功',
    BATCH_GRADE_SUCCESS: '批量批改成功',
    NOT_FOUND: '作业不存在',
    DEADLINE_PASSED: '已过截止时间',
  },

  // 签到相关
  CHECKIN: {
    CREATE_SUCCESS: '签到发布成功',
    SUBMIT_SUCCESS: '签到成功',
    ALREADY_CHECKED: '已签到，请勿重复操作',
    NOT_FOUND: '签到不存在',
    EXPIRED: '签到已结束',
  },

  // 文件上传
  UPLOAD: {
    SUCCESS: '上传成功',
    FAILED: '上传失败',
    TOO_LARGE: '文件过大',
    INVALID_TYPE: '不支持的文件类型',
    FILE_NOT_FOUND: '文件不存在',
  },

  // 视频相关
  VIDEO: {
    UPLOAD_SUCCESS: '视频上传成功',
    DELETE_SUCCESS: '视频删除成功',
    NOT_FOUND: '视频不存在',
    IN_USE: '视频正在被使用，无法删除',
  },
} as const
