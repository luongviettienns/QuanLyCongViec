import { Modal, Form, Input, Select, type FormInstance } from 'antd';
import type {
  CreateTeamPayload,
  UpdateTeamPayload,
  AddMemberPayload,
} from '../types/team.types';

interface TeamModalsProps {
  createModalOpen: boolean;
  editModalOpen: boolean;
  addMemberModalOpen: boolean;
  actionSubmitting: boolean;
  isOwner: boolean;
  createForm: FormInstance<CreateTeamPayload>;
  editForm: FormInstance<UpdateTeamPayload>;
  addMemberForm: FormInstance<AddMemberPayload>;
  onCloseCreateModal: () => void;
  onCloseEditModal: () => void;
  onCloseAddMemberModal: () => void;
  onCreateTeam: (values: CreateTeamPayload) => Promise<void>;
  onEditTeam: (values: UpdateTeamPayload) => Promise<void>;
  onAddMember: (values: AddMemberPayload) => Promise<void>;
}

export function TeamModals({
  createModalOpen,
  editModalOpen,
  addMemberModalOpen,
  actionSubmitting,
  isOwner,
  createForm,
  editForm,
  addMemberForm,
  onCloseCreateModal,
  onCloseEditModal,
  onCloseAddMemberModal,
  onCreateTeam,
  onEditTeam,
  onAddMember,
}: TeamModalsProps) {
  return (
    <>
      <Modal
        title="Tạo nhóm làm việc mới"
        open={createModalOpen}
        onCancel={onCloseCreateModal}
        onOk={() => void createForm.submit()}
        confirmLoading={actionSubmitting}
        okText="Tạo nhóm"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => void onCreateTeam(values)}>
          <Form.Item
            name="name"
            label="Tên nhóm"
            rules={[
              { required: true, message: 'Vui lòng nhập tên nhóm' },
              { min: 2, message: 'Tên nhóm tối thiểu 2 ký tự' },
              { max: 50, message: 'Tên nhóm tối đa 50 ký tự' },
            ]}
          >
            <Input placeholder="Ví dụ: Đội ngũ Phát triển Web" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả nhóm" rules={[{ max: 255, message: 'Tối đa 255 ký tự' }]}>
            <Input.TextArea placeholder="Mô tả mục tiêu hoặc phạm vi công việc của nhóm" rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Chỉnh sửa thông tin nhóm"
        open={editModalOpen}
        onCancel={onCloseEditModal}
        onOk={() => void editForm.submit()}
        confirmLoading={actionSubmitting}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={(values) => void onEditTeam(values)}>
          <Form.Item
            name="name"
            label="Tên nhóm"
            rules={[
              { required: true, message: 'Vui lòng nhập tên nhóm' },
              { min: 2, message: 'Tên nhóm tối thiểu 2 ký tự' },
              { max: 50, message: 'Tên nhóm tối đa 50 ký tự' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Mô tả nhóm" rules={[{ max: 255, message: 'Tối đa 255 ký tự' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Thêm thành viên vào nhóm"
        open={addMemberModalOpen}
        onCancel={onCloseAddMemberModal}
        onOk={() => void addMemberForm.submit()}
        confirmLoading={actionSubmitting}
        okText="Thêm thành viên"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form
          form={addMemberForm}
          layout="vertical"
          initialValues={{ role: 'MEMBER' }}
          onFinish={(values) => void onAddMember(values)}
        >
          <Form.Item
            name="email"
            label="Email tài khoản"
            rules={[
              { required: true, message: 'Vui lòng nhập email của thành viên' },
              { type: 'email', message: 'Định dạng email không hợp lệ' },
            ]}
          >
            <Input placeholder="Ví dụ: memberbel@example.com" />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
            <Select
              options={
                isOwner
                  ? [
                      { label: 'Thành viên (MEMBER)', value: 'MEMBER' },
                      { label: 'Quản trị viên (ADMIN)', value: 'ADMIN' },
                    ]
                  : [{ label: 'Thành viên (MEMBER)', value: 'MEMBER' }]
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
