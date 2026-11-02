export interface IProject {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
