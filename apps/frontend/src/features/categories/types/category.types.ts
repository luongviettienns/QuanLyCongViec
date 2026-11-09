export interface Category {
  id: number;
  name: string;
  color: string;
  userId?: number;
  teamId?: number | null;
  team?: {
    id: number;
    name: string;
  } | null;
}

export interface CreateCategoryPayload {
  name: string;
  color?: string;
  teamId?: number | null;
}

export interface UpdateCategoryPayload {
  name?: string;
  color?: string;
}

export type CategoryScope = 'all' | 'personal' | 'team';

export interface CategoryQueryParams {
  teamId?: number;
  scope?: CategoryScope;
}

export const CATEGORY_PRESET_COLORS = [
  '#1677ff',
  '#52c41a',
  '#fa8c16',
  '#f5222d',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#faad14',
];
