export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export const isValidPassword = (password: string): boolean =>
  password.length >= PASSWORD_MIN_LENGTH &&
  password.length <= PASSWORD_MAX_LENGTH &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password)

export const passwordPolicyMessage = '密码必须包含字母和数字，长度为8-128位'
