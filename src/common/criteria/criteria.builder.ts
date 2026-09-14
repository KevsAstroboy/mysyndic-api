import { CriteriaGroup, Operator } from './types';
import { isValidColumn, isValidRelation } from './criteria.helpers';

export interface BuiltQuery {
  where: Record<string, unknown>;
  orderBy?: Record<string, string> | Array<Record<string, string>>;
  skip: number;
  take: number;
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
}

export class CriteriaBuilder {
  constructor(private readonly modelName: string) {}

  build(criteria: CriteriaGroup): BuiltQuery {
    const where = this.buildWhere(criteria);
    const orderBy = this.buildOrderBy(criteria);
    const skip = (criteria.page - 1) * criteria.size;
    const take = criteria.size;

    const result: BuiltQuery = { where, skip, take };

    if (orderBy && orderBy.length > 0) {
      result.orderBy =
        orderBy.length === 1 ? orderBy[0] : orderBy;
    }

    const hasFields = criteria.fields.length > 0;
    const hasInclude = criteria.include.length > 0;

    if (hasFields && hasInclude) {
      result.select = this.buildSelect(criteria);
    } else if (hasFields) {
      result.select = this.buildSelect(criteria);
    } else if (hasInclude) {
      result.include = this.buildInclude(criteria);
    }

    return result;
  }

  private buildWhere(criteria: CriteriaGroup): Record<string, unknown> {
    const clauses: Record<string, unknown>[] = [];

    for (const c of criteria.criteria) {
      if (!isValidColumn(this.modelName, c.field)) continue;

      const clause = this.criterionToWhere(c);
      if (clause) clauses.push(clause);
    }

    if (clauses.length === 0) return {};

    if (criteria.logic === 'or' && clauses.length === 1) {
      return clauses[0];
    }

    const combined: Record<string, unknown> = {};
    combined[criteria.logic === 'or' ? 'OR' : 'AND'] = clauses;
    return combined;
  }

  private criterionToWhere(
    c: CriteriaGroup['criteria'][0],
  ): Record<string, unknown> | null {
    const val = c.value;
    const vals = c.values;

    switch (c.operator) {
      case Operator.EQ:
        return { [c.field]: this.coerceValue(val!) };

      case Operator.NEQ:
        return { [c.field]: { not: this.coerceValue(val!) } };

      case Operator.GT:
        return { [c.field]: { gt: this.coerceValue(val!) } };

      case Operator.GTE:
        return { [c.field]: { gte: this.coerceValue(val!) } };

      case Operator.LT:
        return { [c.field]: { lt: this.coerceValue(val!) } };

      case Operator.LTE:
        return { [c.field]: { lte: this.coerceValue(val!) } };

      case Operator.IN:
        return { [c.field]: { in: (vals ?? []).map((v) => this.coerceValue(String(v))) } };

      case Operator.NIN:
        return { [c.field]: { notIn: (vals ?? []).map((v) => this.coerceValue(String(v))) } };

      case Operator.LIKE:
        return {
          [c.field]: { contains: val, mode: 'insensitive' },
        };

      case Operator.BT:
        return this.betweenClause(c.field, vals!, 'gte', 'lte');

      case Operator.BTIO:
        return this.betweenClause(c.field, vals!, 'gte', 'lt');

      case Operator.BTOI:
        return this.betweenClause(c.field, vals!, 'gt', 'lte');

      case Operator.BTOO:
        return this.betweenClause(c.field, vals!, 'gt', 'lt');

      case Operator.NULL:
        return { [c.field]: null };

      case Operator.NNULL:
        return { [c.field]: { not: null } };

      default:
        return null;
    }
  }

  private betweenClause(
    field: string,
    vals: (string | number)[],
    op1: string,
    op2: string,
  ): Record<string, unknown> {
    if (vals.length !== 2) return {};
    return {
      [field]: {
        [op1]: this.coerceValue(String(vals[0])),
        [op2]: this.coerceValue(String(vals[1])),
      },
    };
  }

  private coerceValue(value: string): string | number | boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    const n = Number(value);
    if (!isNaN(n) && value.trim() !== '') return n;
    return value;
  }

  private buildOrderBy(criteria: CriteriaGroup) {
    return criteria._sort
      .filter((s) => isValidColumn(this.modelName, s.field))
      .map((s) => ({
        [s.field]: s.asc ? 'asc' as const : 'desc' as const,
      }));
  }

  private buildSelect(
    criteria: CriteriaGroup,
  ): Record<string, unknown> {
    const select: Record<string, unknown> = {};

    for (const field of criteria.fields) {
      if (isValidColumn(this.modelName, field)) {
        select[field] = true;
      }
    }

    for (const relation of criteria.include) {
      if (isValidRelation(this.modelName, relation)) {
        select[relation] = true;
      }
    }

    return select;
  }

  private buildInclude(
    criteria: CriteriaGroup,
  ): Record<string, unknown> {
    const include: Record<string, unknown> = {};

    for (const relation of criteria.include) {
      if (isValidRelation(this.modelName, relation)) {
        include[relation] = true;
      }
    }

    return include;
  }
}
