import { useState } from 'react';
import { Modal, Tabs, Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import { changePassword } from '../api/auth.api';
import {
  getFriendlyErrorMessage,
  isAbortError,
  isUnauthorizedError,
} from '../../../shared/api';

interface AccountSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ProfileFormValues {
  name: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function AccountSettingsModal({ open, onClose }: AccountSettingsModalProps) {
  const { user, updateProfile } = useAuth();
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleSaveProfile(values: ProfileFormValues) {
    try {
      setSavingProfile(true);
      await updateProfile(values.name.trim());
      message.success('Cập nhật tên hiển thị thành công');
      onClose();
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        return;
      }
      message.error(
        getFriendlyErrorMessage(error, 'Không thể cập nhật thông tin cá nhân'),
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSavePassword(values: PasswordFormValues) {
    try {
      setSavingPassword(true);
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('Đổi mật khẩu thành công');
      passwordForm.resetFields();
      onClose();
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        return;
      }
      message.error(getFriendlyErrorMessage(error, 'Không thể đổi mật khẩu'));
    } finally {
      setSavingPassword(false);
    }
  }

  const busy = savingProfile || savingPassword;

  return (
    <Modal
      title="Tài khoản & Bảo mật"
      open={open}
      onCancel={onClose}
      footer={null}
      width={460}
      destroyOnHidden
      closable={!busy}
      maskClosable={!busy}
      afterOpenChange={(visible) => {
        if (visible) {
          setActiveTab('profile');
          profileForm.setFieldsValue({ name: user?.name ?? '' });
          passwordForm.resetFields();
        }
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          if (key === 'profile' || key === 'password') {
            setActiveTab(key);
          }
        }}
        items={[
          {
            key: 'profile',
            label: (
              <span>
                <UserOutlined /> Thông tin cá nhân
              </span>
            ),
            children: (
              <Form
                form={profileForm}
                layout="vertical"
                initialValues={{ name: user?.name ?? '' }}
                onFinish={(values) => void handleSaveProfile(values)}
              >
                <Form.Item label="Email đăng nhập">
                  <Input
                    value={user?.email ?? ''}
                    prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                    disabled
                  />
                </Form.Item>

                <Form.Item
                  name="name"
                  label="Tên hiển thị"
                  rules={[
                    { required: true, message: 'Vui lòng nhập tên hiển thị' },
                    {
                      validator: (_, value: string) => {
                        const trimmed = (value ?? '').trim();
                        if (trimmed.length < 2) {
                          return Promise.reject(new Error('Tên phải có ít nhất 2 ký tự'));
                        }
                        if (trimmed.length > 50) {
                          return Promise.reject(new Error('Tên không được vượt quá 50 ký tự'));
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="Nhập tên hiển thị (2 - 50 ký tự)"
                    maxLength={50}
                  />
                </Form.Item>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button onClick={onClose} disabled={savingProfile}>
                    Huỷ
                  </Button>
                  <Button type="primary" htmlType="submit" loading={savingProfile}>
                    Lưu thay đổi
                  </Button>
                </div>
              </Form>
            ),
          },
          {
            key: 'password',
            label: (
              <span>
                <LockOutlined /> Đổi mật khẩu
              </span>
            ),
            children: (
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={(values) => void handleSavePassword(values)}
              >
                <Form.Item
                  name="currentPassword"
                  label="Mật khẩu hiện tại"
                  rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="Nhập mật khẩu hiện tại"
                  />
                </Form.Item>

                <Form.Item
                  name="newPassword"
                  label="Mật khẩu mới"
                  rules={[
                    { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                    { min: 8, message: 'Mật khẩu mới phải có ít nhất 8 ký tự' },
                    { max: 64, message: 'Mật khẩu mới không được vượt quá 64 ký tự' },
                    {
                      pattern: /^\S+$/,
                      message: 'Mật khẩu mới không được chứa khoảng trắng',
                    },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="Từ 8 đến 64 ký tự, không khoảng trắng"
                    maxLength={64}
                  />
                </Form.Item>

                <Form.Item
                  name="confirmPassword"
                  label="Xác nhận mật khẩu mới"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
                      },
                    }),
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="Nhập lại mật khẩu mới"
                    maxLength={64}
                  />
                </Form.Item>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button onClick={onClose} disabled={savingPassword}>
                    Huỷ
                  </Button>
                  <Button type="primary" htmlType="submit" loading={savingPassword}>
                    Đổi mật khẩu
                  </Button>
                </div>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}
