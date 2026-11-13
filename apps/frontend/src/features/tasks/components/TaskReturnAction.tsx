import { useState } from 'react';
import { Button, Modal, Form, Input, message } from 'antd';
import { RollbackOutlined } from '@ant-design/icons';
import { returnTask } from '../api/tasks.api';
import { getFriendlyErrorMessage } from '../../../shared/api';
import { shouldIgnoreTaskApiError } from '../utils/task-error.utils';

export interface TaskReturnActionProps {
  taskId: number;
  taskTitle: string;
  onReturned: () => Promise<void> | void;
}

interface ReturnFormValues {
  reason: string;
}

export function TaskReturnAction({
  taskId,
  taskTitle,
  onReturned,
}: TaskReturnActionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<ReturnFormValues>();

  const handleOpen = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleCancel = () => {
    if (!submitting) {
      form.resetFields();
      setModalOpen(false);
    }
  };

  const handleSubmit = async (values: ReturnFormValues) => {
    try {
      setSubmitting(true);
      await returnTask(taskId, values.reason.trim());
      message.success('Trả lại công việc thành công');
      form.resetFields();
      setModalOpen(false);
      await onReturned();
    } catch (error) {
      if (shouldIgnoreTaskApiError(error)) {
        return;
      }
      message.error(
        getFriendlyErrorMessage(error, 'Không thể trả lại công việc'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        danger
        ghost
        icon={<RollbackOutlined />}
        onClick={handleOpen}
      >
        Trả lại công việc
      </Button>

      <Modal
        title={`Trả lại công việc: ${taskTitle}`}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={handleCancel}
        confirmLoading={submitting}
        okText="Xác nhận trả lại"
        cancelText="Huỷ"
        okButtonProps={{ danger: true }}
        destroyOnHidden
      >
        <p style={{ marginBottom: 12, color: 'rgba(0, 0, 0, 0.65)' }}>
          Bạn có chắc chắn muốn trả lại công việc này cho người giao việc không? Vui lòng nêu rõ lý do.
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
        >
          <Form.Item
            name="reason"
            label="Lý do trả lại"
            rules={[
              { required: true, message: 'Vui lòng nhập lý do trả lại công việc' },
              { min: 3, message: 'Lý do phải có ít nhất 3 ký tự' },
              { max: 500, message: 'Lý do không được vượt quá 500 ký tự' },
              {
                validator: (_, value: string) => {
                  if (value && value.trim().length < 3) {
                    return Promise.reject(
                      new Error('Lý do không được chỉ chứa khoảng trắng'),
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.TextArea
              rows={4}
              maxLength={500}
              showCount
              placeholder="Nhập lý do trả lại công việc cho người giao việc (từ 3 đến 500 ký tự)..."
              disabled={submitting}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default TaskReturnAction;
