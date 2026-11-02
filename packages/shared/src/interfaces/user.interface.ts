import { UserRole } from '../enums/role.enum.js';

export interface IUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: Date | string;
  updatedAt: Date | string;
}
