export enum Operator {
  EQ = 'eq',
  NEQ = 'neq',
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  IN = 'in',
  NIN = 'nin',
  LIKE = 'like',
  BT = 'bt',
  BTIO = 'btio',
  BTOI = 'btoi',
  BTOO = 'btoo',
  NULL = 'null',
  NNULL = 'nnull',
}

export interface Criterion {
  field: string;
  operator: Operator;
  value?: string;
  values?: (string | number)[];
}

export interface SortField {
  field: string;
  asc: boolean;
}

export interface CriteriaGroup {
  criteria: Criterion[];
  logic: 'and' | 'or';
  page: number;
  size: number;
  _sort: SortField[];
  fields: string[];
  include: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
