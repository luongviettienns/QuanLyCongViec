import { TaskStatus } from '../enums/task.enum.js';
import { Priority } from '../enums/priority.enum.js';

export interface ITask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  projectId: string;
  assigneeId?: string;
  creatorId: string;
  dueDate?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
