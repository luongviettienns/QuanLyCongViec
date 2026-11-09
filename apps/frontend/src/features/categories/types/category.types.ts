export interface Category {
  id: number;
  name: string;
  color: string;
}

export interface CreateCategoryPayload {
  name: string;
  color?: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  color?: string;
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
