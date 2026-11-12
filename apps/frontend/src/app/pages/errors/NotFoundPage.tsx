import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';

export default function NotFoundPage() {
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
        status="404"
        title="404"
        subTitle="Xin lỗi, trang bạn đang tìm kiếm không tồn tại hoặc đã được di chuyển."
        extra={
          <Button
            type="primary"
            icon={<HomeOutlined />}
            onClick={() => navigate('/dashboard')}
          >
            Về trang chủ
          </Button>
        }
      />
    </div>
  );
}
