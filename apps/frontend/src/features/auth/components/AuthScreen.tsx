import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Space } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import type { LoginPayload, RegisterPayload } from '../types/auth.types';

const { Title, Text, Link } = Typography;

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function handleLoginSubmit(values: LoginPayload) {
    try {
      setSubmitting(true);
      await login(values);
      message.success('Đăng nhập thành công');
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
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Đăng ký thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f7fa',
        padding: '24px 16px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Space direction="vertical" align="center" size={8}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                backgroundColor: '#1677ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: 24,
                margin: '0 auto',
              }}
            >
              <CheckSquareOutlined />
            </div>
            <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
              TaskFlow
            </Title>
            <Text type="secondary">
              {isLogin ? 'Đăng nhập để quản lý công việc' : 'Tạo tài khoản TaskFlow mới'}
            </Text>
          </Space>
        </div>

        {isLogin ? (
          <Form layout="vertical" onFinish={(values) => void handleLoginSubmit(values)}>
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Vui lòng nhập email' },
                { type: 'email', message: 'Email không hợp lệ' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="name@example.com" size="large" />
            </Form.Item>

            <Form.Item
              label="Mật khẩu"
              name="password"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Nhập mật khẩu" size="large" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 16, marginTop: 24 }}>
              <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
                Đăng nhập
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={(values) => void handleRegisterSubmit(values)}>
            <Form.Item
              label="Họ và tên"
              name="name"
              rules={[
                { required: true, message: 'Vui lòng nhập họ và tên' },
                { min: 2, message: 'Họ tên phải có ít nhất 2 ký tự' },
                { max: 50, message: 'Họ tên không được vượt quá 50 ký tự' },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="Nguyễn Văn A" size="large" />
            </Form.Item>

            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Vui lòng nhập email' },
                { type: 'email', message: 'Email không hợp lệ' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="name@example.com" size="large" />
            </Form.Item>

            <Form.Item
              label="Mật khẩu"
              name="password"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu' },
                { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Tối thiểu 8 ký tự" size="large" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 16, marginTop: 24 }}>
              <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
                Đăng ký tài khoản
              </Button>
            </Form.Item>
          </Form>
        )}

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          {isLogin ? (
            <Text type="secondary">
              Chưa có tài khoản?{' '}
              <Link onClick={() => setIsLogin(false)}>Đăng ký ngay</Link>
            </Text>
          ) : (
            <Text type="secondary">
              Đã có tài khoản?{' '}
              <Link onClick={() => setIsLogin(true)}>Đăng nhập ngay</Link>
            </Text>
          )}
        </div>
      </Card>
    </div>
  );
}
