import {
  Controller,
  Get,
  Query,
  Request,
  Res,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_PREFIXES = new Set([
  'recus',
  'documents',
  'preuves',
  'alertes',
  'incidents',
  'avatars',
  'feed',
]);

@ApiTags('Fichiers')
@Controller('files')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class FilesPreviewController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('preview')
  @ApiOperation({
    summary: 'Aperçu d un fichier (image/PDF) par chemin objet',
    description:
      'L utilisateur ne peut lire que les fichiers de sa cité (recus, documents, preuves, alertes, incidents).',
  })
  async preview(
    @Query('path') path: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const objectPath = decodeURIComponent(path || '');
    if (!objectPath) {
      throw new BadRequestException('Paramètre path requis');
    }
    const segments = objectPath.split('/').filter(Boolean);
    if (segments.length < 2 || objectPath.includes('..')) {
      throw new ForbiddenException('Chemin invalide');
    }
    if (!ALLOWED_PREFIXES.has(segments[0])) {
      throw new ForbiddenException('Répertoire non autorisé');
    }

    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' && !req.user.cite_id;
    if (!isSuperAdmin && segments[1] !== req.user.cite_id) {
      throw new ForbiddenException('Fichier hors de votre cité');
    }

    const row = await this.prisma.app_config.findUnique({
      where: { key: 'MINIO_BUCKET_DOCUMENTS' },
    });
    const bucket = row?.value ?? 'mysyndic-documents';

    let result;
    try {
      result = await this.storage.getObjectStream(bucket, objectPath);
    } catch {
      throw new NotFoundException('Fichier introuvable');
    }

    const contentType = result.contentType ?? 'application/octet-stream';
    const size = result.size;

    // HTTP Range — nécessaire au seek des vidéos (feed) sans exposer MinIO.
    const range = req.headers.range;
    const match =
      typeof range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (match && (match[1] || match[2])) {
      let start = match[1] ? parseInt(match[1], 10) : undefined;
      let end = match[2] ? parseInt(match[2], 10) : undefined;
      if (start === undefined && end !== undefined) {
        start = Math.max(size - end, 0);
        end = size - 1;
      } else {
        end = end === undefined ? size - 1 : Math.min(end, size - 1);
      }
      if (
        start !== undefined &&
        Number.isFinite(start) &&
        start <= end &&
        start < size
      ) {
        const length = end - start + 1;
        res.status(206);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', String(length));
        res.setHeader('Cache-Control', 'private, max-age=300');
        const partial = await this.storage.getPartialObject(
          bucket,
          objectPath,
          start,
          length,
        );
        (partial as unknown as NodeJS.ReadableStream).pipe(res);
        return;
      }
    }

    res.status(200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, max-age=300');
    (result.stream as unknown as NodeJS.ReadableStream).pipe(res);
  }

  @Get('presign')
  @ApiOperation({
    summary: 'URL pré-signée d un fichier (affichage <img>/<a> nu)',
    description:
      'Mêmes règles de périmètre que preview (fichiers de la cité active, recus/documents/preuves/alertes/incidents).',
  })
  async presign(
    @Query('path') path: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const objectPath = decodeURIComponent(path || '');
    if (!objectPath) {
      throw new BadRequestException('Paramètre path requis');
    }
    const segments = objectPath.split('/').filter(Boolean);
    if (segments.length < 2 || objectPath.includes('..')) {
      throw new ForbiddenException('Chemin invalide');
    }
    if (!ALLOWED_PREFIXES.has(segments[0])) {
      throw new ForbiddenException('Répertoire non autorisé');
    }

    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' && !req.user.cite_id;
    if (!isSuperAdmin && segments[1] !== req.user.cite_id) {
      throw new ForbiddenException('Fichier hors de votre cité');
    }

    const row = await this.prisma.app_config.findUnique({
      where: { key: 'MINIO_BUCKET_DOCUMENTS' },
    });
    const bucket = row?.value ?? 'mysyndic-documents';

    try {
      const url = await this.storage.getPresignedUrl(bucket, objectPath, 300);
      return { url };
    } catch {
      throw new NotFoundException('Fichier introuvable');
    }
  }
}
