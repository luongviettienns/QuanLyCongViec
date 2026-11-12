import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { LoginOutlined } from '@ant-design/icons';

export default function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Result
        status="warning"
        title="401 - Hết hạn phiên đăng nhập"
        subTitle="Phiên đăng nhập của bạn đã hết hạn hoặc bạn chưa được xác thực. Vui lòng đăng nhập lại để tiếp tục."
        extra={
          <Button
            type="primary"
            icon={<LoginOutlined />}
            onClick={() => navigate('/login')}
          >
            Đăng nhập lại
          </Button>
        }
      />
    </div>
  );
}
