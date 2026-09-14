import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

export function isUploadEmpty(file?: Express.Multer.File): boolean {
  return !file || file.size === 0 || !file.buffer || file.buffer.length === 0;
}

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async bucket(): Promise<string> {
    const row = await this.prisma.app_config.findUnique({
      where: { key: 'MINIO_BUCKET_DOCUMENTS' },
    });
    return row?.value ?? 'mysyndic-documents';
  }

  /**
   * Upload une photo (image) vers MinIO et retourne le chemin objet.
   * Le chemin intègre la cité : {folder}/{citeId}/{uuid}.{ext}
   */
  async uploadPhoto(
    citeId: string,
    folder: 'alertes' | 'incidents' | 'preuves' | 'avatars',
    file: Express.Multer.File,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Fichier image requis');
    }
    const ext = IMAGE_MIME_TO_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        `Format d'image non supporté : ${file.mimetype} (jpg, png, webp)`,
      );
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new BadRequestException('Image trop volumineuse (max 8 Mo)');
    }

    const bucket = await this.bucket();
    await this.storage.ensureBucket(bucket);
    const objectName = `${folder}/${citeId}/${randomUUID()}.${ext}`;
    await this.storage.uploadFile(bucket, objectName, file.buffer, file.mimetype);
    return objectName;
  }
}
