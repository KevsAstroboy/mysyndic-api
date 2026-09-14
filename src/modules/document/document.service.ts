import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

const MAX_SIZE = 20 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'text/plain': 'txt',
};

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private async appConfigValue(key: string, def: string): Promise<string> {
    const row = await this.prisma.app_config.findUnique({
      where: { key },
    });
    return row?.value ?? def;
  }

  async upload(citeId: string, auteurId: string, file: Express.Multer.File, dto: UploadDocumentDto) {
    if (!file) throw new BadRequestException('Fichier requis');
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Fichier trop volumineux (max 20 Mo)');
    }
    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException(`Type de fichier non supporté : ${file.mimetype}`);
    }

    const bucket = await this.appConfigValue(
      'MINIO_BUCKET_DOCUMENTS',
      'mysyndic-documents',
    );
    await this.storage.ensureBucket(bucket);
    const objectName = `documents/${citeId}/${randomUUID()}.${ext}`;
    await this.storage.uploadFile(bucket, objectName, file.buffer, file.mimetype);

    const type = await this.prisma.type_document.findFirst({
      where: { extension: ext, is_deleted: false },
    });

    return this.prisma.document.create({
      data: {
        cite_id: citeId,
        auteur_id: auteurId,
        titre: dto.titre,
        file_path: objectName,
        type_id: type?.id ?? null,
        taille_ko: Math.round(file.size / 1024),
        created_at: new Date(),
      },
      include: { type_document: { select: { id: true, libelle: true, code: true } } },
    });
  }

  findAll(citeId: string) {
    return this.prisma.document.findMany({
      where: { cite_id: citeId, is_deleted: false },
      orderBy: { created_at: 'desc' as const },
      include: {
        type_document: { select: { id: true, libelle: true, code: true } },
        user: { select: { id: true, prenom: true, nom: true } },
      },
    });
  }

  private async findOne(citeId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    return doc;
  }

  async download(citeId: string, id: string) {
    const doc = await this.findOne(citeId, id);
    const bucket = await this.appConfigValue(
      'MINIO_BUCKET_DOCUMENTS',
      'mysyndic-documents',
    );
    const ttlSec = Number(
      await this.appConfigValue('MINIO_PRESIGNED_URL_TTL_SEC', '3600'),
    );
    const url = await this.storage.getPresignedUrl(bucket, doc.file_path, ttlSec);
    return {
      id: doc.id,
      titre: doc.titre,
      taille_ko: doc.taille_ko,
      url,
      file_name: doc.file_path.split('/').pop(),
    };
  }

  async remove(citeId: string, id: string, userId: string) {
    const doc = await this.findOne(citeId, id);
    return this.prisma.document.update({
      where: { id: doc.id },
      data: { is_deleted: true, deleted_at: new Date(), deleted_by: userId },
    });
  }

  async getTypes() {
    return this.prisma.type_document.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true, extension: true },
      orderBy: { libelle: 'asc' },
    });
  }
}