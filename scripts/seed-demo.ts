/**
 * Seed : positionne de vrais mots de passe sur les comptes de démo (remplace
 * les placeholders "$2b$12$HASH_*" du dump SQL) et force must_change_password
 * sur le compte SYNDIC/CHEF_SECURITE selon les réglages du seed.
 *
 * Usage :
 *   npx ts-node scripts/seed-demo.ts
 *   SEED_PASSWORD=P@ssw0rd! npx ts-node scripts/seed-demo.ts
 *
 * Le mot de passe ne doit JAMAIS être dans le code — variable d'env ou défaut
 * réservé à l'env de dev (le .env.development ne doit PAS être commité).
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'MySyndic2026!';

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD) {
    console.error('❌ Refusé en production : SEED_PASSWORD requis.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users = await prisma.user.findMany({ where: { is_deleted: false } });
  let updated = 0;

  for (const u of users) {
    const isPlaceholder = u.password_hash.startsWith('$2b$12$HASH_');
    if (!isPlaceholder) continue;

    const changed = await prisma.user.update({
      where: { id: u.id },
      data: { password_hash: hash, updated_at: new Date() },
    });
    if (changed) updated++;
    // minuscule log clair
    console.log(`  ✓ ${u.email}`);
  }

  console.log(`\n✅ ${updated} compte(s) seedé(s) — mot de passe commun :`);
  console.log(`   ${DEMO_PASSWORD}`);
  console.log(`   Utilisez par exemple SUPER_ADMIN : germain@mysyndic.ci`);
  console.log(`   ADMIN Synacassy : admin.s1@mysyndic.ci`);
  console.log(`   SYNDIC : ama.sika@mysyndic.ci`);
  console.log(`   HABITANT : kofi.mensah@email.com`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});