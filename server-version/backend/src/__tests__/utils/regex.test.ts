/**
 * 正则表达式工具函数测试
 */
import { describe, it, expect } from 'vitest'
import {
  USERNAME_REGEX,
  PASSWORD_REGEX,
  PHONE_REGEX,
  EMAIL_REGEX,
  validators
} from '../../utils/regex'

describe('Regex Validators', () => {
  describe('USERNAME_REGEX', () => {
    it('should validate correct usernames', () => {
      expect(USERNAME_REGEX.test('user123')).toBe(true)
      expect(USERNAME_REGEX.test('test_user')).toBe(true)
      expect(USERNAME_REGEX.test('abc')).toBe(true)
      expect(USERNAME_REGEX.test('a'.repeat(20))).toBe(true)
    })

    it('should reject invalid usernames', () => {
      expect(USERNAME_REGEX.test('ab')).toBe(false) // too short
      expect(USERNAME_REGEX.test('a'.repeat(21))).toBe(false) // too long
      expect(USERNAME_REGEX.test('user-name')).toBe(false) // hyphen not allowed
      expect(USERNAME_REGEX.test('user@email')).toBe(false) // @ not allowed
    })
  })

  describe('PASSWORD_REGEX', () => {
    it('should validate correct passwords', () => {
      expect(PASSWORD_REGEX.test('Password123')).toBe(true)
      expect(PASSWORD_REGEX.test('abc12345')).toBe(true)
    })

    it('should reject invalid passwords', () => {
      expect(PASSWORD_REGEX.test('short1')).toBe(false) // too short
      expect(PASSWORD_REGEX.test('passwordonly')).toBe(false) // no number
      expect(PASSWORD_REGEX.test('12345678')).toBe(false) // no letter
    })
  })

  describe('PHONE_REGEX', () => {
    it('should validate correct phone numbers', () => {
      expect(PHONE_REGEX.test('13800138000')).toBe(true)
      expect(PHONE_REGEX.test('15912345678')).toBe(true)
    })

    it('should reject invalid phone numbers', () => {
      expect(PHONE_REGEX.test('12345678901')).toBe(false) // wrong prefix
      expect(PHONE_REGEX.test('1380013800')).toBe(false) // too short
      expect(PHONE_REGEX.test('138001380000')).toBe(false) // too long
    })
  })

  describe('EMAIL_REGEX', () => {
    it('should validate correct emails', () => {
      expect(EMAIL_REGEX.test('user@example.com')).toBe(true)
      expect(EMAIL_REGEX.test('test.user@domain.co')).toBe(true)
    })

    it('should reject invalid emails', () => {
      expect(EMAIL_REGEX.test('notanemail')).toBe(false)
      expect(EMAIL_REGEX.test('@example.com')).toBe(false)
      expect(EMAIL_REGEX.test('user@')).toBe(false)
    })
  })

  describe('validators', () => {
    it('isValidUsername should work correctly', () => {
      expect(validators.isValidUsername('validuser')).toBe(true)
      expect(validators.isValidUsername('ab')).toBe(false)
    })

    it('isValidPassword should work correctly', () => {
      expect(validators.isValidPassword('Valid123')).toBe(true)
      expect(validators.isValidPassword('weak')).toBe(false)
    })

    it('isValidPhone should work correctly', () => {
      expect(validators.isValidPhone('13800138000')).toBe(true)
      expect(validators.isValidPhone('12345678901')).toBe(false)
    })
  })
})
