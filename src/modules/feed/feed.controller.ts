import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';
import { FeedService } from './feed.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CommentaireDto } from './dto/commentaire.dto';
import { FeedQueryDto } from './dto/feed-query.dto';

const FEED_TMP_DIR = path.join(os.tmpdir(), 'mysyndic-feed');
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

const feedMulterOptions = {
  storage: diskStorage({
    destination: (
      _req: unknown,
      _file: unknown,
      cb: (e: Error | null, dest: string) => void,
    ) => {
      fs.mkdir(FEED_TMP_DIR, { recursive: true }, (err) =>
        cb(err, FEED_TMP_DIR),
      );
    },
    filename: (
      _req: unknown,
      _file: unknown,
      cb: (e: Error | null, name: string) => void,
    ) => {
      cb(null, randomUUID());
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
};

@ApiTags('Feed')
@Controller('feed')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class FeedController {
  constructor(
    private readonly feedService: FeedService,
    private readonly criteria: CriteriaService,
  ) {}

  @Post()
  @RequireFeature('FEED_CREATE')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Publier un post (texte et/ou médias)',
    description:
      "Multipart. Champ `media` : jusqu'à 3 photos OU 1 vidéo (tous codecs video/* acceptés). " +
      '`contenu` optionnel si média présent. Un post ne peut pas mélanger photos et vidéo.',
  })
  @ApiResponse({ status: 201, description: 'Post publié' })
  @ApiResponse({ status: 400, description: 'Média invalide ou post vide' })
  @UseInterceptors(FilesInterceptor('media', 4, feedMulterOptions))
  create(
    @Body() dto: CreatePostDto,
    @UploadedFiles() media: Express.Multer.File[] | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.create(
      req.user.cite_id,
      req.user.sub,
      dto,
      media ?? [],
    );
  }

  @Get()
  @RequireFeature('FEED_READ')
  @ApiOperation({
    summary: 'Fil de ma cité — pagination par curseur',
    description:
      'Pagination keyset : renvoie { items, next_cursor }. Repasser next_cursor en query pour la page suivante.',
  })
  @ApiResponse({ status: 200, description: 'Page de posts' })
  findAll(@Query() query: FeedQueryDto, @Request() req: AuthenticatedRequest) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.findAll(req.user.cite_id, req.user.sub, query);
  }

  @Get('get-by-criteria')
  @RequireFeature('FEED_READ')
  @ApiOperation({
    summary: 'Posts de ma cité — DSL critères paginé',
    description:
      'DSL critères : <champ>.<op>=..., sort=(-)champ, fields=..., include=..., page, size, logic=and|or.',
  })
  async getByCriteria(
    @Query() query: Record<string, string>,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.criteria.paginate('feed_post', query, {
      cite_id: req.user.cite_id,
      is_deleted: false,
    });
  }

  @Get(':id')
  @RequireFeature('FEED_READ')
  @ApiOperation({ summary: "Détail d'un post (médias, likes, compteurs)" })
  @ApiResponse({ status: 200, description: 'Détail' })
  @ApiResponse({ status: 404, description: 'Post introuvable' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.findOne(id, req.user.cite_id, req.user.sub);
  }

  @Get(':id/commentaires')
  @RequireFeature('FEED_READ')
  @ApiOperation({
    summary: "Commentaires d'un post — pagination par curseur",
    description:
      'Renvoie { items, next_cursor }. Racines (niveau 1) paginées, réponses (niveau 2) incluses par page.',
  })
  @ApiResponse({ status: 200, description: 'Page de commentaires' })
  @ApiResponse({ status: 404, description: 'Post introuvable' })
  findCommentaires(
    @Param('id') id: string,
    @Query() query: FeedQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.findCommentaires(id, req.user.cite_id, query);
  }

  @Delete(':id')
  @RequireFeature('FEED_DELETE_OWN')
  @ApiOperation({
    summary: 'Supprimer un post (auteur, ou modérateur FEED_MODERATE)',
  })
  @ApiResponse({ status: 200, description: 'Post supprimé' })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.remove(id, req.user.cite_id, req.user.sub);
  }

  @Post(':id/like')
  @RequireFeature('FEED_LIKE')
  @ApiOperation({ summary: 'Liker un post (idempotent)' })
  @ApiResponse({ status: 201, description: '{ liked, likes_count }' })
  like(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.like(id, req.user.cite_id, req.user.sub);
  }

  @Delete(':id/like')
  @RequireFeature('FEED_LIKE')
  @ApiOperation({ summary: 'Unliker un post (idempotent)' })
  @ApiResponse({ status: 200, description: '{ liked, likes_count }' })
  unlike(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.unlike(id, req.user.cite_id, req.user.sub);
  }

  @Post(':id/commentaires')
  @RequireFeature('FEED_COMMENT')
  @ApiOperation({ summary: 'Commenter un post' })
  @ApiResponse({ status: 201, description: 'Commentaire créé' })
  addCommentaire(
    @Param('id') id: string,
    @Body() dto: CommentaireDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.addCommentaire(
      id,
      req.user.cite_id,
      req.user.sub,
      dto,
    );
  }

  @Post(':id/commentaires/:commentId/repondre')
  @RequireFeature('FEED_COMMENT')
  @ApiOperation({ summary: 'Répondre à un commentaire (niveau 2)' })
  @ApiResponse({ status: 201, description: 'Réponse créée' })
  @ApiResponse({ status: 400, description: 'Profondeur max 2 atteinte' })
  repondre(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: CommentaireDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.feedService.repondre(
      id,
      commentId,
      req.user.cite_id,
      req.user.sub,
      dto,
    );
  }
}
