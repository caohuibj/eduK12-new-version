function validateUsername(username) {
  if (!username || username.trim().length < 3) {
    return { valid: false, message: '用户名至少3个字符' }
  }
  if (username.length > 20) {
    return { valid: false, message: '用户名最多20个字符' }
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, message: '用户名只能包含字母、数字和下划线' }
  }
  return { valid: true, message: '' }
}

function validatePassword(password) {
  if (!password || password.length < 6) {
    return { valid: false, message: '密码至少6个字符' }
  }
  if (password.length > 50) {
    return { valid: false, message: '密码最多50个字符' }
  }
  return { valid: true, message: '' }
}

function validateNickname(nickname) {
  if (!nickname || nickname.trim().length < 2) {
    return { valid: false, message: '昵称至少2个字符' }
  }
  const regex = /^(?:[\u4e00-\u9fa5]{2,10}|[a-zA-Z\s]{2,20})$/
  if (!regex.test(nickname.trim())) {
    return { valid: false, message: '请输入中文昵称（中文2-10字或英文2-20字母）' }
  }
  return { valid: true, message: '' }
}

function validateCourseCode(code) {
  if (!code || code.trim().length < 4) {
    return { valid: false, message: '课程码格式不正确' }
  }
  return { valid: true, message: '' }
}

module.exports = {
  validateUsername,
  validatePassword,
  validateNickname,
  validateCourseCode
}
