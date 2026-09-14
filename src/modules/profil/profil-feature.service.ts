import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VERSION_RE = /^v(\d+)\.(\d+)$/;

function nextVersion(tag: string | null | undefined): string {
  const m = VERSION_RE.exec(tag ?? '');
  if (!m) return 'v1.1';
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (minor >= 99) return `v${major + 1}.0`;
  return `v${major}.${minor + 1}`;
}

/** Version strictement supérieure à toutes celles existantes pour ce profil. */
async function newestTag(prisma: PrismaService, profilId: number): Promise<string | null> {
  const rows = await prisma.profil_feature.findMany({
    where: { profil_id: profilId, is_deleted: false },
    distinct: ['version_tag'],
    select: { version_tag: true },
  });
  return rows
    .map((r) => r.version_tag)
    .sort((a, b) => a.localeCompare(b))[rows.length - 1] ?? null;
}

@Injectable()
export class ProfilFeatureService {
  constructor(private readonly prisma: PrismaService) {}

  async listProfilsFeatures() {
    const profils = await this.prisma.profil.findMany({
      where: { is_deleted: false },
      orderBy: { id: 'asc' },
      select: { id: true, libelle: true, code: true },
    });

    const features = await this.prisma.feature.findMany({
      where: { is_deleted: false },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, libelle: true, module: true },
    });

    const byModule: Record<string, typeof features> = {};
    for (const f of features) {
      const m = f.module ?? 'AUTRE';
      (byModule[m] ??= []).push(f);
    }

    const result: Array<Record<string, unknown>> = [];
    for (const p of profils) {
      const activeRows = await this.prisma.profil_feature.findMany({
        where: {
          profil_id: p.id,
          is_deleted: false,
          valid_from: { lte: new Date() },
          OR: [{ valid_until: null }, { valid_until: { gt: new Date() } }],
        },
        select: { feature: { select: { code: true } } },
      });
      const active = new Set(activeRows.map((r) => r.feature.code));
      result.push({
        ...p,
        modules: Object.entries(byModule).map(([module, items]) => ({
          module,
          features: items.map((f) => ({ ...f, active: active.has(f.code) })),
        })),
      });
    }

    return result;
  }

  async setProfilFeatures(profilId: number, codes: string[]) {
    const profil = await this.prisma.profil.findFirst({
      where: { id: profilId, is_deleted: false },
    });
    if (!profil) throw new NotFoundException('Profil introuvable');

    // SUPER_ADMIN garde la main : on refuse de lui retirer ses permissions.
    if (profil.code === 'SUPER_ADMIN') {
      throw new BadRequestException('Les features du super admin sont immuables');
    }

    if (codes.length === 0) {
      throw new BadRequestException('Au moins une feature requise');
    }

    const wanted = await this.prisma.feature.findMany({
      where: { code: { in: codes }, is_deleted: false },
      select: { id: true, code: true },
    });
    if (wanted.length !== new Set(codes).size) {
      throw new BadRequestException('Certaines features demandées sont inconnues');
    }

    const current = await this.prisma.profil_feature.findFirst({
      where: {
        profil_id: profilId,
        is_deleted: false,
        valid_until: null,
      },
      select: { version_tag: true },
    });
    // Tag basé sur le plus grand existant (évite les collisions réécrites).
    const latest = await newestTag(this.prisma, profilId);
    const newTag = nextVersion(latest ?? current?.version_tag ?? 'v1.0');
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Clôture des lignes actives courantes.
      await tx.profil_feature.updateMany({
        where: { profil_id: profilId, is_deleted: false, valid_until: null },
        data: { valid_until: now },
      });

      // Insertion de la nouvelle version (une ligne par feature).
      for (const f of wanted) {
        await tx.profil_feature.create({
          data: {
            profil_id: profilId,
            feature_id: f.id,
            version_tag: newTag,
            valid_from: now,
            valid_until: null,
            is_deleted: false,
            created_at: now,
            updated_at: now,
            created_by: 0,
          },
        });
      }

      // Snapshot versionné.
      await tx.$executeRawUnsafe(
        `CALL snapshot_profil_features($1::int, $2::varchar, $3::varchar)`,
        profilId,
        newTag,
        `Réglage features ${profil.code} (${newTag})`,
      );
    });

    // Le bump de version_tag fait détecter le changement par isSessionStale
    // (RbacGuard recharge les features à la prochaine requête de l'utilisateur).

    return { profil_id: profilId, version: newTag, features: wanted.map((w) => w.code) };
  }
}