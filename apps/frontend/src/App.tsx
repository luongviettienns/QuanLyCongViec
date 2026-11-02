import { useState, useEffect } from 'react';
import { Table, Button, Tag } from 'antd';


interface Task {
  id: number;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
}

function App() {

  const [tasks, setTasks] = useState<Task[]>([]);


  async function loadTasks() {
    try {
      const response = await fetch('/tasks');

      if (!response.ok) {
        throw new Error('Không thể tải công việc');
      }

      const data: Task[] = await response.json();

      setTasks(data);
    } catch (error) {
      console.error('Lỗi API:', error);
    }
  }


  useEffect(() => {
    void loadTasks();
  }, []);


  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (status: Task['status']) => (
        <Tag color={status === 'DONE' ? 'green' : 'blue'}>
          {status}
        </Tag>
      ),
    },
  ];


  return (
    <div style={{ padding: 30 }}>
      <h1>TaskFlow</h1>

      <Button onClick={() => void loadTasks()}>
        Tải lại
      </Button>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={tasks}
        style={{ marginTop: 20 }}
      />
    </div>
  );
}

export default App;