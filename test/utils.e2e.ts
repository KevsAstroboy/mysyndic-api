import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { DateFormatInterceptor } from '../src/common/interceptors/date-format.interceptor';
import { StripNullInterceptor } from '../src/common/interceptors/strip-null.interceptor';

export const TEST_CITE_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_VILLA_ID = '00000000-0000-0000-AAAA-000000000004';

export const TEST_USERS = {
  superAdmin: {
    email: 'e2e.super@mysyndic.ci',
    password: 'E2eToken!X',
    profil: 'SUPER_ADMIN',
    citeId: null,
  },
  admin: {
    email: 'e2e.admin@mysyndic.ci',
    password: 'E2eToken!X',
    profil: 'ADMIN',
    citeId: TEST_CITE_ID,
    mustChange: false,
  },
  habitant: {
    email: 'e2e.habitant@mysyndic.ci',
    password: 'E2eToken!X',
    profil: 'HABITANT',
    citeId: TEST_CITE_ID,
    mustChange: false,
  },
  syndic: {
    email: 'e2e.syndic@mysyndic.ci',
    password: 'E2eToken!X',
    profil: 'SYNDIC',
    citeId: TEST_CITE_ID,
    mustChange: false,
  },
  chefSecurite: {
    email: 'e2e.chef@mysyndic.ci',
    password: 'E2eToken!X',
    profil: 'CHEF_SECURITE',
    citeId: TEST_CITE_ID,
    mustChange: false,
  },
};

export async function seedTestData(prisma: PrismaService) {
  const hash = await bcrypt.hash('E2eToken!X', 4);

  // cite
  await prisma.cite.upsert({
    where: { id: TEST_CITE_ID },
    create: { id: TEST_CITE_ID, nom: 'E2E Synacassy', pays: "Côte d'Ivoire" },
    update: { nom: 'E2E Synacassy', pays: "Côte d'Ivoire" },
  });

  // groupe cité (requis par add_user_to_cite_groupe)
  await prisma.groupe_cite.upsert({
    where: { cite_id: TEST_CITE_ID },
    create: { cite_id: TEST_CITE_ID, nom: 'Chat E2E Synacassy' },
    update: {},
  });

  // configuration par défaut (GET/PATCH configurazion)
  await prisma.configuration.upsert({
    where: { cite_id: TEST_CITE_ID },
    create: {
      cite_id: TEST_CITE_ID,
      cotisation_mensuelle: 25000,
      lien_wave: 'https://pay.wave.com/m/e2e',
      paystack_subaccount_mode: 'SIMPLE',
      paystack_subaccount_split: 100,
    },
    update: {},
  });

  // villa
  await prisma.villa.upsert({
    where: { id: TEST_VILLA_ID },
    create: {
      id: TEST_VILLA_ID,
      cite_id: TEST_CITE_ID,
      numero: 'E2E-1',
    },
    update: {},
  });

  // SUPER_ADMIN user (cite null)
  await prisma.user.upsert({
    where: { email: TEST_USERS.superAdmin.email },
    create: {
      email: TEST_USERS.superAdmin.email,
      prenom: 'E2E',
      nom: 'Super',
      password_hash: hash,
      is_active: true,
      must_change_password: false,
    },
    update: { password_hash: hash, is_active: true },
  });
  const superUser = await prisma.user.findFirstOrThrow({
    where: { email: TEST_USERS.superAdmin.email },
  });
  const superProfil = await prisma.profil.findFirstOrThrow({
    where: { code: 'SUPER_ADMIN' },
  });
  await prisma.user_profil.deleteMany({ where: { user_id: superUser.id } });
  await prisma.user_profil.create({
    data: {
      user_id: superUser.id,
      profil_id: superProfil.id,
      cite_id: null,
      order_priority: 1,
    },
  });

  // ADMIN user (cite Synacassy)
  await prisma.user.upsert({
    where: { email: TEST_USERS.admin.email },
    create: {
      email: TEST_USERS.admin.email,
      prenom: 'E2E',
      nom: 'Admin',
      password_hash: hash,
      cite_id: TEST_CITE_ID,
      is_active: true,
      must_change_password: false,
    },
    update: { password_hash: hash, is_active: true },
  });
  const adminUser = await prisma.user.findFirstOrThrow({
    where: { email: TEST_USERS.admin.email },
  });
  const adminProfil = await prisma.profil.findFirstOrThrow({
    where: { code: 'ADMIN' },
  });
  await prisma.user_profil.deleteMany({ where: { user_id: adminUser.id } });
  await prisma.user_profil.create({
    data: {
      user_id: adminUser.id,
      profil_id: adminProfil.id,
      cite_id: TEST_CITE_ID,
      order_priority: 1,
    },
  });

  // HABITANT user
  await prisma.user.upsert({
    where: { email: TEST_USERS.habitant.email },
    create: {
      email: TEST_USERS.habitant.email,
      prenom: 'E2E',
      nom: 'Habitant',
      password_hash: hash,
      cite_id: TEST_CITE_ID,
      is_active: true,
      must_change_password: false,
    },
    update: { password_hash: hash, is_active: true },
  });
  const habitantUser = await prisma.user.findFirstOrThrow({
    where: { email: TEST_USERS.habitant.email },
  });
  const habitantProfil = await prisma.profil.findFirstOrThrow({
    where: { code: 'HABITANT' },
  });
  await prisma.user_profil.deleteMany({ where: { user_id: habitantUser.id } });
  await prisma.user_profil.create({
    data: {
      user_id: habitantUser.id,
      profil_id: habitantProfil.id,
      cite_id: TEST_CITE_ID,
      order_priority: 1,
    },
  });
  await prisma.user_villa.deleteMany({ where: { user_id: habitantUser.id } });
  await prisma.user_villa.create({
    data: {
      user_id: habitantUser.id,
      villa_id: TEST_VILLA_ID,
      cite_id: TEST_CITE_ID,
      is_current: true,
    },
  });

  // SYNDIC user
  await prisma.user.upsert({
    where: { email: TEST_USERS.syndic.email },
    create: {
      email: TEST_USERS.syndic.email,
      prenom: 'E2E',
      nom: 'Syndic',
      password_hash: hash,
      cite_id: TEST_CITE_ID,
      is_active: true,
      must_change_password: false,
    },
    update: { password_hash: hash, is_active: true },
  });
  const syndicUser = await prisma.user.findFirstOrThrow({
    where: { email: TEST_USERS.syndic.email },
  });
  const syndicProfil = await prisma.profil.findFirstOrThrow({
    where: { code: 'SYNDIC' },
  });
  await prisma.user_profil.deleteMany({ where: { user_id: syndicUser.id } });
  await prisma.user_profil.create({
    data: {
      user_id: syndicUser.id,
      profil_id: syndicProfil.id,
      cite_id: TEST_CITE_ID,
      order_priority: 1,
    },
  });

  // CHEF_SECURITE user
  await prisma.user.upsert({
    where: { email: TEST_USERS.chefSecurite.email },
    create: {
      email: TEST_USERS.chefSecurite.email,
      prenom: 'E2E',
      nom: 'ChefSecurite',
      password_hash: hash,
      cite_id: TEST_CITE_ID,
      is_active: true,
      must_change_password: false,
    },
    update: { password_hash: hash, is_active: true },
  });
  const chefUser = await prisma.user.findFirstOrThrow({
    where: { email: TEST_USERS.chefSecurite.email },
  });
  const chefProfil = await prisma.profil.findFirstOrThrow({
    where: { code: 'CHEF_SECURITE' },
  });
  await prisma.user_profil.deleteMany({ where: { user_id: chefUser.id } });
  await prisma.user_profil.create({
    data: {
      user_id: chefUser.id,
      profil_id: chefProfil.id,
      cite_id: TEST_CITE_ID,
      order_priority: 1,
    },
  });
}

export async function cleanTestDb(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE audit_log, notification, message, groupe_cite_membre,
      user_villa, user_profil, "user", webhook, paiement, recu_paiement,
      alerte_securite, incident, incident_commentaire, incident_like,
      feed_post, feed_post_media, feed_post_like, feed_post_commentaire,
      annonce, document, conflit, otp, groupe_cite,
      villa, configuration, cite
    RESTART IDENTITY CASCADE`);
}

export async function setupTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5433/mysyndic_db_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6380';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const prisma = moduleFixture.get(PrismaService);
  await cleanTestDb(prisma);
  await seedTestData(prisma);

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new DateFormatInterceptor(), new StripNullInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return { app, prisma };
}