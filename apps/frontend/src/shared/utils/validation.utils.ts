import type { FormRule } from 'antd';

/**
 * Antd `min`/`max` rules measure the raw string, while the backend validates the
 * trimmed value. These helpers validate what will actually be sent so the form
 * never lets through a value the API is certain to reject.
 */

interface TrimmedLengthOptions {
  label: string;
  min?: number;
  max?: number;
}

export function trimmedLengthRule({ label, min, max }: TrimmedLengthOptions): FormRule {
  return {
    validator: (_, value: unknown) => {
      if (typeof value !== 'string' || value === '') {
        return Promise.resolve();
      }
      const length = value.trim().length;
      if (length === 0) {
        return Promise.reject(new Error(`${label} không được chỉ chứa khoảng trắng`));
      }
      if (min !== undefined && length < min) {
        return Promise.reject(new Error(`${label} phải có ít nhất ${min} ký tự`));
      }
      if (max !== undefined && length > max) {
        return Promise.reject(new Error(`${label} không được vượt quá ${max} ký tự`));
      }
      return Promise.resolve();
    },
  };
}

/** Password rule shared by register: 8-64 chars, no whitespace (mirrors RegisterDto). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export const passwordRules: FormRule[] = [
  { required: true, message: 'Vui lòng nhập mật khẩu' },
  { min: PASSWORD_MIN_LENGTH, message: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự` },
  { max: PASSWORD_MAX_LENGTH, message: `Mật khẩu không được vượt quá ${PASSWORD_MAX_LENGTH} ký tự` },
  { pattern: /^\S+$/, message: 'Mật khẩu không được chứa khoảng trắng' },
];
