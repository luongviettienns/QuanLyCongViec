import { useState } from 'react';
import { Modal, Tabs, Form, Input, Button, message } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import type { LoginPayload, RegisterPayload } from '../types/auth.types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [loginForm] = Form.useForm<LoginPayload>();
  const [registerForm] = Form.useForm<RegisterPayload>();

  async function handleLoginSubmit(values: LoginPayload) {
    try {
      setSubmitting(true);
      await login(values);
      message.success('Đăng nhập thành công');
      loginForm.resetFields();
      onClose();
      onSuccess();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Đăng nhập thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterSubmit(values: RegisterPayload) {
    try {
      setSubmitting(true);
      await register(values);
      message.success('Đăng ký tài khoản thành công');
      registerForm.resetFields();
      onClose();
      onSuccess();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Đăng ký thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={400}
      title={activeTab === 'login' ? 'Đăng nhập vào TaskFlow' : 'Tạo tài khoản mới'}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'login' | 'register')}
        centered
        items={[
          {
            key: 'login',
            label: 'Đăng nhập',
            children: (
              <Form
                form={loginForm}
                layout="vertical"
                onFinish={(values) => void handleLoginSubmit(values)}
                style={{ marginTop: 16 }}
              >
                <Form.Item
                  label="Email"
                  name="email"
                  rules={[
                    { required: true, message: 'Vui lòng nhập email' },
                    { type: 'email', message: 'Email không hợp lệ' },
                  ]}
                >
                  <Input prefix={<MailOutlined />} placeholder="name@example.com" />
                </Form.Item>

                <Form.Item
                  label="Mật khẩu"
                  name="password"
                  rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu của bạn" />
                </Form.Item>

                <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                  <Button type="primary" htmlType="submit" block loading={submitting}>
                    Đăng nhập
                  </Button>
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'register',
            label: 'Đăng ký',
            children: (
              <Form
                form={registerForm}
                layout="vertical"
                onFinish={(values) => void handleRegisterSubmit(values)}
                style={{ marginTop: 16 }}
              >
                <Form.Item
                  label="Họ và tên"
                  name="name"
                  rules={[
                    { required: true, message: 'Vui lòng nhập họ và tên' },
                    { min: 2, message: 'Họ tên phải có ít nhất 2 ký tự' },
                    { max: 50, message: 'Họ tên không được vượt quá 50 ký tự' },
                  ]}
                >
                  <Input prefix={<UserOutlined />} placeholder="Nguyễn Văn A" />
                </Form.Item>

                <Form.Item
                  label="Email"
                  name="email"
                  rules={[
                    { required: true, message: 'Vui lòng nhập email' },
                    { type: 'email', message: 'Email không hợp lệ' },
                  ]}
                >
                  <Input prefix={<MailOutlined />} placeholder="name@example.com" />
                </Form.Item>

                <Form.Item
                  label="Mật khẩu"
                  name="password"
                  rules={[
                    { required: true, message: 'Vui lòng nhập mật khẩu' },
                    { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="Tối thiểu 8 ký tự" />
                </Form.Item>

                <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                  <Button type="primary" htmlType="submit" block loading={submitting}>
                    Đăng ký tài khoản
                  </Button>
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}
