import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';

const SCRIPTS_DIR = __dirname;
const TEMPLATES_DIR = path.join(SCRIPTS_DIR, 'templates');
const SRC_DIR = path.resolve(SCRIPTS_DIR, '..', 'src');

const SKIP_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'is_deleted',
  'created_by',
  'updated_by',
  'deleted_by',
]);

const EXCLUDE_MODELS = new Set(['user']);

interface ScalarField {
  name: string;
  type: string;
  tsType: string;
  isRequired: boolean;
  isOptional: boolean;
  maxLength: number;
  example: string;
}

interface RelationField {
  name: string;
  modelName: string;
}

interface ModelMeta {
  modelName: string;
  prismaName: string;
  kebabName: string;
  camelName: string;
  routeName: string;
  label: string;
  labelPlural: string;
  scalars: ScalarField[];
  relations: RelationField[];
  hasRelations: boolean;
  hasString: boolean;
  hasInt: boolean;
  hasBoolean: boolean;
  hasDate: boolean;
  hasIsDeleted: boolean;
  hasCreatedAt: boolean;
  hasUpdatedAt: boolean;
  hasDeletedAt: boolean;
  hasNoIsDeleted: boolean;
  hasCiteId: boolean;
  hasNoCiteId: boolean;
  hasCreatedAtOrUpdatedAt: boolean;
  orderByField: string;
  featureCode: string;
  idType: 'string' | 'number';
}

const TYPE_MAP: Record<string, { tsType: string; type: string; maxLength: number }> = {
  String: { tsType: 'string', type: 'string', maxLength: 255 },
  Int: { tsType: 'number', type: 'number', maxLength: 0 },
  Boolean: { tsType: 'boolean', type: 'boolean', maxLength: 0 },
  DateTime: { tsType: 'string', type: 'date', maxLength: 0 },
  Float: { tsType: 'number', type: 'number', maxLength: 0 },
  BigInt: { tsType: 'number', type: 'number', maxLength: 0 },
  Decimal: { tsType: 'number', type: 'number', maxLength: 0 },
  Json: { tsType: 'Record<string, unknown>', type: 'json', maxLength: 0 },
  Bytes: { tsType: 'string', type: 'string', maxLength: 0 },
};

function exampleFor(field: ScalarField): string {
  switch (field.type) {
    case 'string':
      return `'Example ${field.name}'`;
    case 'number':
      return '1';
    case 'boolean':
      return 'true';
    case 'date':
      return "'2026-01-01T00:00:00.000Z'";
    case 'json':
      return '{}';
    default:
      return "''";
  }
}

function toPascalCase(str: string): string {
  return str
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .replace(/[\s]+/g, '-')
    .toLowerCase();
}

function humanLabel(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

function extractMeta(modelName: string): ModelMeta {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) throw new Error(`Prisma model "${modelName}" not found in DMMF`);

  const pascalName = toPascalCase(modelName);

  const scalars: ScalarField[] = model.fields
    .filter((f) => f.kind === 'scalar')
    .filter((f) => !SKIP_FIELDS.has(f.name))
    .map((f) => {
      const info = TYPE_MAP[f.type] || TYPE_MAP.String;
      const isRequired = f.isRequired && !f.hasDefaultValue;
      return {
        name: f.name,
        type: info.type,
        tsType: info.tsType,
        isRequired,
        isOptional: !isRequired,
        maxLength: info.maxLength,
        example: '',
      };
    });

  for (const s of scalars) {
    s.example = exampleFor(s);
  }

  const scalarNames = new Set(model.fields.filter((f) => f.kind === 'scalar').map((f) => f.name));

  const relations: RelationField[] = model.fields
    .filter((f) => f.kind === 'object')
    .filter((f) => !f.relationName?.startsWith('_'))
    // Skip relations whose FK scalar (cite_id, auteur_id, ...) is already exposed
    .filter((f) => {
      const fk = f.relationFromFields?.[0];
      return !(fk && scalarNames.has(fk));
    })
    .map((f) => ({ name: f.name, modelName: toPascalCase(f.type) }));

  const hasField = (name: string) => model.fields.some((f) => f.name === name);

  return {
    modelName: pascalName,
    prismaName: modelName,
    kebabName: toKebabCase(modelName),
    camelName: toCamelCase(modelName),
    routeName: toKebabCase(modelName),
    label: humanLabel(modelName),
    labelPlural: humanLabel(modelName) + 's',
    scalars,
    relations,
    hasRelations: relations.length > 0,
    hasString: scalars.some((s) => s.type === 'string'),
    hasInt: scalars.some((s) => s.type === 'number'),
    hasBoolean: scalars.some((s) => s.type === 'boolean'),
    hasDate: scalars.some((s) => s.type === 'date'),
    hasIsDeleted: hasField('is_deleted'),
    hasCreatedAt: hasField('created_at'),
    hasUpdatedAt: hasField('updated_at'),
    hasDeletedAt: hasField('deleted_at'),
    hasNoIsDeleted: !hasField('is_deleted'),
    hasCiteId: hasField('cite_id'),
    hasNoCiteId: !hasField('cite_id'),
    hasCreatedAtOrUpdatedAt: hasField('created_at') || hasField('updated_at'),
    orderByField: hasField('created_at') ? 'created_at' : hasField('id') ? 'id' : model.fields[0].name,
    featureCode: 'GERER_' + pascalName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
    idType: model.fields.find((f) => f.name === 'id')?.type === 'Int' ? 'number' : 'string',
  };
}

function processScalarBlock(body: string, s: ScalarField): string {
  let r = body;

  r = r.replace(/{{name}}/g, s.name);
  r = r.replace(/{{tsType}}/g, s.tsType);
  r = r.replace(/{{example}}/g, s.example);
  r = r.replace(/{{maxLength}}/g, String(s.maxLength));
  r = r.replace(/{{type}}/g, s.type);

  r = r.replace(/\{\{#if isString\}\}([\s\S]*?)\{\{\/if\}\}/g, s.type === 'string' ? '$1' : '');
  r = r.replace(/\{\{#if isInt\}\}([\s\S]*?)\{\{\/if\}\}/g, s.type === 'number' ? '$1' : '');
  r = r.replace(/\{\{#if isBoolean\}\}([\s\S]*?)\{\{\/if\}\}/g, s.type === 'boolean' ? '$1' : '');
  r = r.replace(/\{\{#if isDate\}\}([\s\S]*?)\{\{\/if\}\}/g, s.type === 'date' ? '$1' : '');

  r = r.replace(/\{\{#if isRequired\}\}([\s\S]*?)\{\{\/if\}\}/g, s.isRequired ? '$1' : '');
  r = r.replace(/\{\{#if isOptional\}\}([\s\S]*?)\{\{\/if\}\}/g, s.isOptional ? '$1' : '');

  return r;
}

function render(template: string, meta: ModelMeta): string {
  let result = template;

  result = result.replace(/{{modelName}}/g, meta.modelName);
  result = result.replace(/{{prismaName}}/g, meta.prismaName);
  result = result.replace(/{{kebabName}}/g, meta.kebabName);
  result = result.replace(/{{camelName}}/g, meta.camelName);
  result = result.replace(/{{routeName}}/g, meta.routeName);
  result = result.replace(/{{labelPlural}}/g, meta.labelPlural);
  result = result.replace(/{{label}}/g, meta.label);
  result = result.replace(/{{featureCode}}/g, meta.featureCode);

  result = result.replace(
    /\{\{#if hasString\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasString ? '$1' : '',
  );
  result = result.replace(
    /\{\{#if hasInt\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasInt ? '$1' : '',
  );
  result = result.replace(
    /\{\{#if hasBoolean\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasBoolean ? '$1' : '',
  );
  result = result.replace(
    /\{\{#if hasDate\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasDate ? '$1' : '',
  );
  result = result.replace(
    /\{\{#if hasRelations\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasRelations ? '$1' : '',
  );

  result = result.replace(
    /\{\{#if hasDeletedAt\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasDeletedAt ? '$1' : '',
  );

  result = result.replace(
    /\{\{#if hasIsDeleted\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasIsDeleted ? '$1' : '',
  );
  result = result.replace(
    /\{\{#if hasNoIsDeleted\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasNoIsDeleted ? '$1' : '',
  );

  result = result.replace(
    /\{\{#if hasCreatedAt\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasCreatedAt ? '$1' : '',
  );
  result = result.replace(
    /\{\{#if hasUpdatedAt\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasUpdatedAt ? '$1' : '',
  );
  result = result.replace(
    /\{\{#if hasCreatedAtOrUpdatedAt\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasCreatedAtOrUpdatedAt ? '$1' : '',
  );

  result = result.replace(
    /\{\{#if hasCiteId\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasCiteId ? '$1' : '',
  );

  result = result.replace(
    /\{\{#if hasNoCiteId\}\}([\s\S]*?)\{\{\/if\}\}/g,
    meta.hasNoCiteId ? '$1' : '',
  );

  result = result.replace(/\{\{orderByField\}\}/g, meta.orderByField);
  result = result.replace(/\{\{idType\}\}/g, meta.idType);

  result = result.replace(
    /\{\{#each scalars\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, body: string) => {
      if (meta.scalars.length === 0) return '';
      return meta.scalars
        .map((s) => processScalarBlock(body, s))
        .join('\n');
    },
  );

  result = result.replace(
    /\{\{#each relations\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, body: string) => {
      if (meta.relations.length === 0) return '';
      return meta.relations
        .map((r) => {
          let r2 = body;
          r2 = r2.replace(/{{name}}/g, r.name);
          r2 = r2.replace(/{{modelName}}/g, r.modelName);
          return r2;
        })
        .join('\n');
    },
  );

  result = result.replace(/\n{3,}/g, '\n\n');

  result = result.replace(/^\n+/, '');

  result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

  return result;
}

function generateModule(meta: ModelMeta, outputDir: string): void {
  const templateFiles = [
    { template: 'dto-create.hbs', target: `dto/create-${meta.kebabName}.dto.ts` },
    { template: 'dto-update.hbs', target: `dto/update-${meta.kebabName}.dto.ts` },
    { template: 'dto-response.hbs', target: `dto/${meta.kebabName}-response.dto.ts` },
    { template: 'service.hbs', target: `${meta.kebabName}.service.ts` },
    { template: 'controller.hbs', target: `${meta.kebabName}.controller.ts` },
    { template: 'module.hbs', target: `${meta.kebabName}.module.ts` },
  ];

  fs.mkdirSync(path.join(outputDir, 'dto'), { recursive: true });

  for (const { template, target } of templateFiles) {
    const templatePath = path.join(TEMPLATES_DIR, template);
    if (!fs.existsSync(templatePath)) {
      console.warn(`  ⚠  Template not found: ${template}`);
      continue;
    }
    const raw = fs.readFileSync(templatePath, 'utf-8');
    const rendered = render(raw, meta);
    const targetPath = path.join(outputDir, target);
    fs.writeFileSync(targetPath, rendered);
  }
}

function listModels(): string[] {
  return Prisma.dmmf.datamodel.models
    .map((m) => m.name)
    .filter((name) => !EXCLUDE_MODELS.has(name));
}

function parseArgs(): { models: string[]; all: boolean; dryRun: boolean; force: boolean; help: boolean } {
  const args = process.argv.slice(2);
  const result = { models: [] as string[], all: false, dryRun: false, force: false, help: false };

  for (const arg of args) {
    switch (arg) {
      case '--all':
        result.all = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--force':
        result.force = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      default:
        if (!arg.startsWith('--')) {
          result.models.push(arg);
        }
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Module Generator — NestJS CRUD scaffold from Prisma models

Usage:
  npx ts-node scripts/generate-module.ts [options] [ModelName ...]

Options:
  --all        Generate modules for all Prisma models
  --dry-run    Preview files without writing
  --force      Overwrite existing module directories
  --help, -h   Show this help

Model names must match the Prisma schema exactly (e.g. "statut_edition", not "StatutEdition").

Examples:
  npx ts-node scripts/generate-module.ts edition        # single model
  npx ts-node scripts/generate-module.ts edition award_category  # multiple
  npx ts-node scripts/generate-module.ts --all            # all models
  npx ts-node scripts/generate-module.ts --dry-run --all  # preview
`);
}

function main(): void {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return;
  }

  const allModels = listModels();

  if (args.all) {
    args.models = allModels;
  }

  if (args.models.length === 0) {
    console.log('No models specified. Use --all or provide model names.');
    console.log('Available models:');
    for (const m of allModels) {
      console.log(`  - ${m}`);
    }
    console.log('Run with --help for usage.');
    return;
  }

  const invalidModels = args.models.filter((m) => !allModels.includes(m));
  if (invalidModels.length > 0) {
    console.error(`Unknown Prisma models: ${invalidModels.join(', ')}`);
    console.error(`Available: ${allModels.join(', ')}`);
    process.exit(1);
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const modelName of args.models) {
    const meta = extractMeta(modelName);
    const moduleDir = path.join(SRC_DIR, meta.kebabName);

    if (fs.existsSync(moduleDir) && !args.force) {
      console.log(`⚠  SKIP  ${meta.kebabName}/ — directory exists (use --force to overwrite)`);
      skipped++;
      continue;
    }

    if (args.force && fs.existsSync(moduleDir)) {
      console.log(`↻  FORCE  ${meta.kebabName}/ — overwriting existing directory`);
    }

    if (args.dryRun) {
      console.log(`◎  DRY-RUN  ${meta.kebabName}/`);
      console.log(`   Model: ${modelName} → ${meta.modelName}`);
      console.log(`   Scalars: ${meta.scalars.map((s) => s.name).join(', ') || '(none)'}`);
      console.log(`   Relations: ${meta.relations.map((r) => r.name).join(', ') || '(none)'}`);
      console.log(`   Feature: ${meta.featureCode}`);
      const templateFiles = [
        `dto/create-${meta.kebabName}.dto.ts`,
        `dto/update-${meta.kebabName}.dto.ts`,
        `dto/${meta.kebabName}-response.dto.ts`,
        `${meta.kebabName}.service.ts`,
        `${meta.kebabName}.controller.ts`,
        `${meta.kebabName}.module.ts`,
      ];
      for (const f of templateFiles) {
        console.log(`   → ${meta.kebabName}/${f}`);
      }
      generated++;
      continue;
    }

    try {
      generateModule(meta, moduleDir);
      console.log(`✓  ${meta.kebabName}/ — generated (${modelName} → ${meta.modelName})`);
      generated++;
    } catch (err: any) {
      console.error(`✗  ${meta.kebabName}/ — error: ${err.message}`);
      errors++;
    }
  }

  console.log(
    `\nDone. Generated: ${generated}, Skipped: ${skipped}, Errors: ${errors}`,
  );
}

main();
