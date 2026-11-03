import { useState, useEffect } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Popconfirm,
  Space,
  message,
} from 'antd';
import type { TableProps } from 'antd';
import KanbanBoard from './components/KanbanBoard';

interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  position?: number;
  startDate?: string | null;
  dueDate?: string | null;
}

type StatusFilter = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE';

interface TaskFormValues {
  title: string;
  description?: string;
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  startDate?: Dayjs | null;
  dueDate?: Dayjs | null;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form] = Form.useForm<TaskFormValues>();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const isFiltering = searchText.trim() !== '' || statusFilter !== 'ALL';

  async function loadTasks(search = searchText, status = statusFilter) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const cleanSearch = search.trim();
      if (cleanSearch) {
        params.append('search', cleanSearch);
      }
      if (status !== 'ALL') {
        params.append('status', status);
      }

      const queryString = params.toString();
      const url = queryString ? `/tasks?${queryString}` : '/tasks';
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Không thể tải danh sách công việc');
      }

      const data: Task[] = await response.json();
      setTasks(data);
    } catch (error) {
      console.error('Lỗi API:', error);
      message.error(error instanceof Error ? error.message : 'Lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function init() {
      try {
        const response = await fetch('/tasks');
        if (!response.ok) {
          throw new Error('Không thể tải danh sách công việc');
        }
        const data: Task[] = await response.json();
        if (!ignore) {
          setTasks(data);
        }
      } catch (error) {
        if (!ignore) {
          console.error('Lỗi API:', error);
          message.error(error instanceof Error ? error.message : 'Lỗi khi tải dữ liệu');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      ignore = true;
    };
  }, []);

  function handleSearch(value: string) {
    setSearchText(value);
    void loadTasks(value, statusFilter);
  }

  function handleStatusChange(value: StatusFilter) {
    setStatusFilter(value);
    void loadTasks(searchText, value);
  }

  function handleReset() {
    setSearchText('');
    setStatusFilter('ALL');
    void loadTasks('', 'ALL');
  }

  function handleOpenCreate() {
    setEditingTask(null);
    setOpen(true);
  }

  function handleOpenEdit(task: Task) {
    setEditingTask(task);
    setOpen(true);
  }

  async function handleSubmit(values: TaskFormValues) {
    try {
      setSaving(true);

      const isEdit = editingTask !== null;
      const url = isEdit ? `/tasks/${editingTask.id}` : '/tasks';
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        title: values.title,
        description: values.description,
        status: values.status,
        startDate: values.startDate ? values.startDate.toISOString() : null,
        dueDate: values.dueDate ? values.dueDate.toISOString() : null,
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg =
          errorData && typeof errorData.message === 'string'
            ? errorData.message
            : Array.isArray(errorData?.message)
              ? errorData.message.join(', ')
              : isEdit
                ? 'Không thể cập nhật công việc'
                : 'Không thể tạo công việc';
        throw new Error(errorMsg);
      }

      message.success(isEdit ? 'Cập nhật công việc thành công' : 'Thêm công việc thành công');
      form.resetFields();
      setOpen(false);
      setEditingTask(null);

      await loadTasks();
    } catch (error) {
      console.error(error);
      message.error(error instanceof Error ? error.message : 'Thao tác thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const response = await fetch(`/tasks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Không thể xoá công việc');
      }

      message.success('Xoá công việc thành công');
      await loadTasks();
    } catch (error) {
      console.error(error);
      message.error(error instanceof Error ? error.message : 'Xoá công việc thất bại');
    }
  }

  async function handleReorder(taskIds: number[], status?: Task['status']) {
    // Bước 1: Lưu trạng thái trước đó để rollback nếu server gặp sự cố
    const previousTasks = [...tasks];

    // Bước 2: Cập nhật giao diện lập tức (Optimistic Update)
    setTasks((prev) => {
      const updated = [...prev];
      taskIds.forEach((id, newIndex) => {
        const itemIndex = updated.findIndex((t) => t.id === id);
        if (itemIndex !== -1) {
          updated[itemIndex] = {
            ...updated[itemIndex],
            position: newIndex,
            ...(status ? { status } : {}),
          };
        }
      });
      return updated;
    });

    // Bước 3: Gửi danh sách ID và status mới lên backend (API PATCH /tasks/reorder)
    try {
      const response = await fetch('/tasks/reorder', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskIds, status }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Không thể lưu thứ tự công việc');
      }

      message.success('Cập nhật thứ tự công việc thành công');
      await loadTasks();
    } catch (error) {
      console.error(error);
      // Hoàn tác về danh sách cũ nếu lưu thất bại
      setTasks(previousTasks);
      message.error(error instanceof Error ? error.message : 'Lỗi khi sắp xếp lại');
    }
  }

  const columns: TableProps<Task>['columns'] = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      render: (title: string) => <strong>{title}</strong>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      render: (desc?: string) => desc || <span style={{ color: '#aaa' }}>Chưa có mô tả</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 150,
      render: (status: Task['status']) => {
        const color = status === 'DONE' ? 'green' : status === 'IN_PROGRESS' ? 'blue' : 'orange';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Bắt đầu',
      dataIndex: 'startDate',
      width: 120,
      render: (date?: string | null) => (date ? formatDate(date) : <span style={{ color: '#bbb' }}>-</span>),
    },
    {
      title: 'Hạn chót',
      dataIndex: 'dueDate',
      width: 160,
      render: (date?: string | null, record?: Task) => {
        if (!date) return <span style={{ color: '#bbb' }}>-</span>;
        const overdue = record && record.status !== 'DONE' && new Date(date).getTime() < Date.now();
        return (
          <span style={{ color: overdue ? '#ff4d4f' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
            {formatDate(date)} {overdue ? '(Quá hạn)' : ''}
          </span>
        );
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" onClick={() => handleOpenEdit(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xác nhận xoá"
            description={`Bạn có chắc chắn muốn xoá công việc "${record.title}"?`}
            onConfirm={() => void handleDelete(record.id)}
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger>
              Xoá
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>TaskFlow</h1>
        <Space>
          <Button onClick={() => void loadTasks()} loading={loading}>
            Tải lại
          </Button>
          <Button type="primary" onClick={handleOpenCreate}>
            Thêm công việc
          </Button>
        </Space>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Input.Search
          placeholder="Tìm kiếm theo tiêu đề hoặc mô tả..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={(val) => handleSearch(val)}
          allowClear
          style={{ width: 320 }}
        />
        <Select<StatusFilter>
          value={statusFilter}
          onChange={handleStatusChange}
          style={{ width: 180 }}
          options={[
            { value: 'ALL', label: 'Tất cả trạng thái' },
            { value: 'TODO', label: 'Cần làm (TODO)' },
            { value: 'IN_PROGRESS', label: 'Đang làm (IN_PROGRESS)' },
            { value: 'DONE', label: 'Hoàn thành (DONE)' },
          ]}
        />
        <Button onClick={handleReset}>
          Đặt lại
        </Button>
      </div>

      <div style={{ marginBottom: 30 }}>
        <KanbanBoard tasks={tasks} onReorder={handleReorder} isFiltering={isFiltering} />
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={tasks}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingTask ? 'Cập nhật công việc' : 'Thêm công việc mới'}
        open={open}
        onOk={() => form.submit()}
        onCancel={() => {
          setOpen(false);
          setEditingTask(null);
        }}
        afterOpenChange={(visible) => {
          if (visible) {
            if (editingTask) {
              form.setFieldsValue({
                title: editingTask.title,
                description: editingTask.description,
                status: editingTask.status,
                startDate: editingTask.startDate ? dayjs(editingTask.startDate) : null,
                dueDate: editingTask.dueDate ? dayjs(editingTask.dueDate) : null,
              });
            } else {
              form.resetFields();
              form.setFieldsValue({
                status: 'TODO',
                startDate: null,
                dueDate: null,
              });
            }
          }
        }}
        confirmLoading={saving}
        okText={editingTask ? 'Lưu thay đổi' : 'Tạo mới'}
        cancelText="Huỷ"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
          initialValues={{ status: 'TODO' }}
        >
          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[
              { required: true, message: 'Vui lòng nhập tiêu đề công việc' },
              { min: 3, message: 'Tiêu đề phải có ít nhất 3 ký tự' },
              { max: 100, message: 'Tiêu đề không được vượt quá 100 ký tự' },
              {
                validator: (_, value: string) => {
                  if (value && value.trim().length < 3) {
                    return Promise.reject(new Error('Tiêu đề không được chỉ chứa khoảng trắng'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input placeholder="Nhập tiêu đề công việc (từ 3 đến 100 ký tự)..." maxLength={100} showCount />
          </Form.Item>

          <Form.Item
            name="description"
            label="Mô tả"
            rules={[{ max: 500, message: 'Mô tả không được vượt quá 500 ký tự' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Nhập mô tả chi tiết (tuỳ chọn, tối đa 500 ký tự)..."
              maxLength={500}
              showCount
            />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="startDate" label="Ngày bắt đầu" style={{ flex: 1 }}>
              <DatePicker
                format="DD/MM/YYYY"
                placeholder="Chọn ngày bắt đầu"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="dueDate"
              label="Hạn chót (Deadline)"
              style={{ flex: 1 }}
              dependencies={['startDate']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue('startDate');
                    if (start && value && value.isBefore(start, 'day')) {
                      return Promise.reject(new Error('Hạn chót phải sau hoặc cùng ngày bắt đầu'));
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker
                format="DD/MM/YYYY"
                placeholder="Chọn hạn chót"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>

          <Form.Item name="status" label="Trạng thái">
            <Select
              options={[
                { value: 'TODO', label: 'TODO' },
                { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
                { value: 'DONE', label: 'DONE' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default App;
