/* eslint-disable no-console */
/**
 * Génère une collection Postman groupée PAR PROFIL.
 *
 * - Lit le document OpenAPI de l'application Nest (avec x-feature posé
 *   par @RequireFeature).
 * - Résout feature -> profils autorisés depuis la base (profil_feature).
 * - Écrit MySyndic.postman_collection.json (ou --out=chemin).
 *
 * Usage : npm run postman:generate
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

Logger.overrideLogger(false);

const PROFIL_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrateur',
  SYNDIC: 'Syndic',
  CHEF_SECURITE: 'Chef de sécurité',
  HABITANT: 'Habitant',
};

// Champs fichier attendus sur les endpoints multipart (ajoutés au body).
const FILE_FIELDS: Record<string, string[]> = {
  'POST /paiements/manuel': ['preuve'],
  'POST /alertes': ['photo'],
  'POST /incidents': ['photo'],
  'POST /documents': ['file'],
};

function resolveRef(ref: string, components: any): any {
  const name = ref.replace('#/components/schemas/', '');
  return components?.schemas?.[name];
}

function sampleValue(prop: any, propName: string, components: any, depth = 0): any {
  if (depth > 4) return '';
  if (prop.example !== undefined) return prop.example;
  if (prop.default !== undefined) return prop.default;
  if (prop.$ref) {
    const sch = resolveRef(prop.$ref, components);
    return sch ? sampleObject(sch, components, depth + 1) : {};
  }
  switch (prop.type) {
    case 'integer':
    case 'number':
      return prop.enum?.[0] ?? 1;
    case 'boolean':
      return true;
    case 'array': {
      if (prop.example) return prop.example;
      const inner =
        prop.items?.example ?? prop.items?.$ref ?? prop.items?.type === 'string'
          ? '2026-09'
          : '';
      return [inner];
    }
    case 'string':
    default: {
      if (prop.enum?.length) return prop.enum[0];
      if (prop.format === 'email') return 'user@example.com';
      if (prop.format === 'uuid' || propName.toLowerCase().includes('uuid'))
        return '00000000-0000-0000-AAAA-000000000001';
      return propName;
    }
  }
}

function sampleObject(schema: any, components: any, depth = 0): any {
  const props = schema?.properties ?? {};
  const required = schema?.required ?? [];
  const out: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries<any>(props)) {
    if (!required.includes(name) && depth === 0) continue;
    if (prop.example === undefined && (prop.readOnly || prop.writeOnly === false)) {
      if (!required.includes(name)) continue;
    }
    out[name] = sampleValue(prop, name, components, depth);
  }
  return out;
}

function bodyFor(operation: any, key: string, components: any): any {
  const rb = operation?.requestBody?.content;
  if (!rb) return undefined;

  const fileFields = FILE_FIELDS[key] ?? [];
  if (rb['multipart/form-data'] || fileFields.length) {
    const schema = rb['multipart/form-data']?.schema ?? {};
    const props = schema?.properties ?? {};
    const formdata: any[] = [];
    for (const [name, prop] of Object.entries<any>(props)) {
      const v = sampleValue(prop, name, components);
      formdata.push({
        key: name,
        value: Array.isArray(v) ? v.join(',') : String(v ?? ''),
        type: 'text',
      });
    }
    for (const f of fileFields) {
      formdata.push({ key: f, type: 'file', src: [], value: '' });
    }
    return { mode: 'formdata', formdata };
  }

  if (rb['application/json']) {
    const schema = rb['application/json'].schema;
    const sample = sampleObject(schema?.$ref ? resolveRef(schema.$ref, components) : schema ?? {}, components);
    return { mode: 'raw', raw: JSON.stringify(sample, null, 2), options: { raw: { language: 'json' } } };
  }
  return undefined;
}

function buildRequest(opPath: string, method: string, operation: any, components: any) {
  const key = `${method.toUpperCase()} ${opPath}`;
  const toVar = (s: string) => s.replace(/^:(.+)$/, '{{$1}}').replace(/^\{(.+)\}$/, '{{$1}}');
  const pathTemplate = opPath.split('/').filter(Boolean).map(toVar).join('/');
  const pathSegments = opPath.split('/').filter(Boolean).map(toVar);
  return {
    method: method.toUpperCase(),
    header: [
      {
        key: 'Authorization',
        value: 'Bearer {{auth_token}}',
      },
      { key: 'Content-Type', value: 'application/json' },
    ],
    body: bodyFor(operation, key, components),
    url: {
      raw: `{{baseUrl}}/${pathTemplate}`,
      host: ['{{baseUrl}}'],
      path: pathSegments,
    },
    description: operation.summary ?? operation.description ?? '',
  };
}

function itemFor(opPath: string, method: string, operation: any, components: any) {
  return {
    name: `${method.toUpperCase()} ${opPath}`,
    request: buildRequest(opPath, method, operation, components),
    response: [],
  };
}

async function main() {
  const outFile = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1]
    ?? path.resolve(process.cwd(), 'MySyndic.postman_collection.json');

  const app = await NestFactory.create(AppModule, { logger: false });
  try {    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MySyndic API').setVersion('0.1').addBearerAuth().build(),
    );

    const prisma = app.get(PrismaService);
    const featureRows = await prisma.$queryRawUnsafe<
      { feature_code: string; profil_code: string }[]
    >(
      `SELECT DISTINCT f.code AS feature_code, p.code AS profil_code
       FROM profil_feature pf
       JOIN feature f ON f.id = pf.feature_id
       JOIN profil p ON p.id = pf.profil_id
       WHERE pf.is_deleted = FALSE AND f.is_deleted = FALSE AND p.is_deleted = FALSE
         AND pf.valid_from <= CURRENT_TIMESTAMP
         AND (pf.valid_until IS NULL OR pf.valid_until > CURRENT_TIMESTAMP)`,
    );

    const featureProfils = new Map<string, Set<string>>();
    for (const r of featureRows) {
      if (!featureProfils.has(r.feature_code)) featureProfils.set(r.feature_code, new Set());
      featureProfils.get(r.feature_code)!.add(r.profil_code);
    }

    const folders: Record<string, { name: string; item: any[] }> = {
      '00 - Auth (public)': { name: '00 - Auth (public)', item: [] },
      '01 - Super Admin': { name: '01 - Super Admin', item: [] },
      '02 - Administrateur': { name: '02 - Administrateur', item: [] },
      '03 - Syndic': { name: '03 - Syndic', item: [] },
      '04 - Chef de sécurité': { name: '04 - Chef de sécurité', item: [] },
      '05 - Habitant': { name: '05 - Habitant', item: [] },
      '06 - Connecté (tous profils)': { name: '06 - Connecté (tous profils)', item: [] },
    };

    const collect = (folderKey: string, entry: any) => {
      folders[folderKey].item.push(entry);
    };

    for (const [opPath, pathItem] of Object.entries<any>(document.paths ?? {})) {
      for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
        const op = pathItem?.[method];
        if (!op) continue;

        const feature = op['x-feature'] as string | undefined;
        const secured = !!op.security && op.security.length > 0;
        const isPublic = !secured;
        const key = `${method.toUpperCase()} ${opPath}`;
        const entry = itemFor(opPath, method, op, document.components);

        if (isPublic || !feature) {
          if (isPublic) collect('00 - Auth (public)', entry);
          else collect('06 - Connecté (tous profils)', entry);
          continue;
        }

        const profils = featureProfils.get(feature) ?? new Set<string>();
        const targetFolders: string[] = [];
        if (profils.has('SUPER_ADMIN')) targetFolders.push('01 - Super Admin');
        if (profils.has('ADMIN')) targetFolders.push('02 - Administrateur');
        if (profils.has('SYNDIC')) targetFolders.push('03 - Syndic');
        if (profils.has('CHEF_SECURITE')) targetFolders.push('04 - Chef de sécurité');
        if (profils.has('HABITANT')) targetFolders.push('05 - Habitant');

        if (targetFolders.length === 0) {
          collect('06 - Connecté (tous profils)', entry);
        } else {
          for (const f of targetFolders) collect(f, entry);
        }
      }
    }

    const order = Object.keys(folders);
    const collection = {
      info: {
        name: 'MySyndic API (par profil)',
        description:
          'Collection générée : services groupés par profil autorisé (features RBAC). Utilise {{baseUrl}} (ex: http://localhost:3000/api).',
        schema:
          'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: order.map((k) => folders[k]),
      variable: [
        { key: 'baseUrl', value: 'http://localhost:3000/api', type: 'string' },
        { key: 'auth_token', value: '', type: 'string' },
      ],
    };

    fs.writeFileSync(outFile, JSON.stringify(collection, null, 2), 'utf8');
    const total = order.reduce((s, k) => s + folders[k].item.length, 0);
    if (total === 0) {
      throw new Error('0 endpoint détecté — la collection générée serait vide');
    }

    // Listing lisible des endpoints par dossier (vérification rapide).
    const lines: string[] = [];
    for (const k of order) {
      const names = folders[k].item.map((i: any) => i.name).sort();
      lines.push(`## ${k} (${names.length})`);
      lines.push(...names.map((n: string) => `  - ${n}`));
      lines.push('');
    }
    fs.writeFileSync(`${outFile}.txt`, lines.join('\n'), 'utf8');

    console.log(`Collection Postman générée : ${outFile}`);
    console.log('Endpoints par dossier :');
    for (const k of order) {
      console.log(`  ${k} -> ${folders[k].item.length}`);
    }
    console.log(`Total requêtes : ${total}`);
    console.log(`Listing détaillé : ${outFile}.txt`);
    // Sortie immédiate : évite un hang de fermeture (redis/sockets/migrations).
    process.exit(0);
  } catch (e) {
    console.error('Échec génération Postman :', e);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Échec génération Postman :', e);
  process.exit(1);
});
