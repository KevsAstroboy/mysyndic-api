import { Prisma } from '@prisma/client';

export function extractScalars(modelName: string): string[] {
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name === modelName,
  );
  if (!model) return [];

  return model.fields
    .filter((f) => f.kind === 'scalar')
    .map((f) => f.name);
}

export function extractRelations(modelName: string): string[] {
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name === modelName,
  );
  if (!model) return [];

  return model.fields
    .filter((f) => f.kind === 'object')
    .map((f) => f.name);
}

export function isValidColumn(
  modelName: string,
  field: string,
): boolean {
  const scalars = extractScalars(modelName);
  return scalars.includes(field);
}

export function isValidRelation(
  modelName: string,
  relation: string,
): boolean {
  const relations = extractRelations(modelName);
  return relations.includes(relation);
}

export function getAllModels(): string[] {
  return Prisma.dmmf.datamodel.models.map((m) => m.name);
}
