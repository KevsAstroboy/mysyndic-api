import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CriteriaParser } from './criteria-parser';
import { CriteriaBuilder } from './criteria.builder';
import { PaginatedResponse } from './types';

interface PrismaDelegate {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  count: (args: { where?: Record<string, unknown> }) => Promise<number>;
}

@Injectable()
export class CriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pagination générique par critères.
   * Query params supportés : <champ>.<op>, sort, fields, include, page, size, logic.
   * Seuls les champs scalaires / relations du modèle Prisma (DMMF) sont acceptés.
   */
  async paginate(
    model: string,
    query: Record<string, string>,
    baseWhere: Record<string, unknown> = {},
  ): Promise<PaginatedResponse<unknown>> {
    const criteria = new CriteriaParser().parse(query);
    const built = new CriteriaBuilder(model).build(criteria);

    const criteriaWhere = built.where;
    const where =
      Object.keys(criteriaWhere).length > 0
        ? { AND: [criteriaWhere, baseWhere] }
        : baseWhere;

    const delegate = (
      this.prisma as unknown as Record<string, PrismaDelegate>
    )[model];
    if (!delegate) {
      throw new Error(`Modèle Prisma inconnu pour les critères : ${model}`);
    }

    const [items, total] = await Promise.all([
      delegate.findMany({
        ...(Object.keys(where).length > 0 ? { where } : {}),
        ...(built.orderBy ? { orderBy: built.orderBy } : {}),
        skip: built.skip,
        take: built.take,
        ...(built.select ? { select: built.select } : {}),
        ...(built.include && !built.select ? { include: built.include } : {}),
      }),
      delegate.count({ where }),
    ]);

    return {
      items,
      total,
      page: criteria.page,
      size: criteria.size,
      pages: Math.ceil(total / criteria.size),
    };
  }
}
