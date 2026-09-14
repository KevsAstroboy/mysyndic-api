import { CriteriaGroup, Operator } from './types';

const OPERATOR_MAP: Record<string, Operator> = {
  eq: Operator.EQ,
  neq: Operator.NEQ,
  gt: Operator.GT,
  gte: Operator.GTE,
  lt: Operator.LT,
  lte: Operator.LTE,
  in: Operator.IN,
  nin: Operator.NIN,
  like: Operator.LIKE,
  bt: Operator.BT,
  btio: Operator.BTIO,
  btoi: Operator.BTOI,
  btoo: Operator.BTOO,
  null: Operator.NULL,
  nnull: Operator.NNULL,
};

export class CriteriaParser {
  parse(query: Record<string, string>): CriteriaGroup {
    const criteriaGroup: CriteriaGroup = {
      criteria: [],
      logic: 'and',
      page: 1,
      size: 20,
      _sort: [],
      fields: [],
      include: [],
    };

    for (const [key, value] of Object.entries(query)) {
      if (typeof value !== 'string') continue;

      if (key === 'sort') {
        criteriaGroup._sort = this.parseSort(value);
        continue;
      }

      if (key === 'page') {
        const p = parseInt(value, 10);
        if (!isNaN(p) && p >= 1) criteriaGroup.page = p;
        continue;
      }

      if (key === 'size') {
        const s = parseInt(value, 10);
        if (!isNaN(s) && s >= 1) {
          criteriaGroup.size = Math.min(s, 1000);
        }
        continue;
      }

      if (key === 'fields') {
        criteriaGroup.fields = value
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
        continue;
      }

      if (key === 'include') {
        criteriaGroup.include = value
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
        continue;
      }

      if (key === 'logic') {
        if (value === 'or') criteriaGroup.logic = 'or';
        continue;
      }

      if (!key.includes('.')) continue;

      const lastDot = key.lastIndexOf('.');
      const field = key.substring(0, lastDot);
      const opStr = key.substring(lastDot + 1);
      const operator = OPERATOR_MAP[opStr];

      if (!operator) continue;

      if (!field || !field.replace(/_/g, '').match(/^[a-zA-Z0-9]+$/)) continue;
      if (field.startsWith('_') || field.startsWith('__')) continue;

      switch (operator) {
        case Operator.IN:
        case Operator.NIN: {
          const values = value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
          if (values.length === 0) continue;
          criteriaGroup.criteria.push({ field, operator, values });
          break;
        }

        case Operator.BT:
        case Operator.BTIO:
        case Operator.BTOI:
        case Operator.BTOO: {
          const parts = value.split(',').map((v) => v.trim()).filter(Boolean);
          if (parts.length !== 2) continue;
          const numericParts = parts.map((v) => {
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
          });
          if (numericParts.includes(null)) continue;
          criteriaGroup.criteria.push({
            field,
            operator,
            values: numericParts as number[],
          });
          break;
        }

        case Operator.NULL:
        case Operator.NNULL: {
          criteriaGroup.criteria.push({ field, operator });
          break;
        }

        default: {
          criteriaGroup.criteria.push({ field, operator, value });
          break;
        }
      }
    }

    return criteriaGroup;
  }

  private parseSort(value: string) {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((part) => {
        if (part.startsWith('-')) {
          return { field: part.substring(1), asc: false };
        }
        const name = part.startsWith('+') ? part.substring(1) : part;
        return { field: name, asc: true };
      });
  }
}
