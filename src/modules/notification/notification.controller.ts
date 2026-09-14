import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Request,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly criteria: CriteriaService,
  ) {}

  /**
   * Les notifications expirent après 24h (soft-delete). Purge opportuniste
   * avant chaque lecture (liste, badge, critères).
   */
  private async purgeExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    await this.prisma.notification.updateMany({
      where: { created_at: { lt: cutoff }, is_deleted: false },
      data: { is_deleted: true, deleted_at: new Date() },
    });
  }

  /**
   * Scope utilisateur : toujours `user_id` = connecté. En plus, quand le user
   * est rattaché à une cité ACTIVE (habitant, syndic…), on ne montre que les
   * notifications de CETTE cité — un compte multi-cités/multi-villas ne doit
   * pas recevoir les notifications de son autre contexte. Les profils globaux
   * (super-admin, admin global, cite_id NULL) voient l'ensemble de leurs
   * notifications (elles portent la cite_id de l'événement qui les a créées).
   */
  private userScope(req: AuthenticatedRequest) {
    return req.user.cite_id
      ? { user_id: req.user.sub, cite_id: req.user.cite_id }
      : { user_id: req.user.sub };
  }

  @Get('get-by-criteria')
  @ApiOperation({
    summary: 'Mes notifications — DSL critères paginé',
    description:
      'DSL critères : <champ>.<op>=..., sort=(-)champ, fields=..., include=..., page, size, logic=and|or.',
  })
  async getByCriteria(
    @Query() query: Record<string, string>,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.purgeExpired();
    return this.criteria.paginate('notification', query, {
      ...this.userScope(req),
      is_deleted: false,
    });
  }

  @Get('types')
  @ApiOperation({ summary: 'Types de notification (référentiel)' })
  @ApiResponse({ status: 200, description: 'Liste des types' })
  async getTypes() {
    return this.prisma.type_notification.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true },
      orderBy: { libelle: 'asc' },
    });
  }

  @Get('badge')
  @ApiOperation({ summary: 'Nombre de notifications non lues' })
  @ApiResponse({ status: 200, description: '{ count }' })
  async badge(@Request() req: AuthenticatedRequest) {
    await this.purgeExpired();
    const count = await this.prisma.notification.count({
      where: { ...this.userScope(req), lu: false, is_deleted: false },
    });
    return { count };
  }

  @Get()
  @ApiOperation({ summary: 'Lister mes notifications' })
  @ApiResponse({ status: 200, description: 'Liste triée par date décroissante' })
  async findAll(@Request() req: AuthenticatedRequest) {
    await this.purgeExpired();
    return this.prisma.notification.findMany({
      where: { ...this.userScope(req), is_deleted: false },
      orderBy: { created_at: 'desc' as const },
      take: 100,
      select: {
        id: true,
        cite_id: true,
        type_id: true,
        titre: true,
        message: true,
        lu: true,
        lu_at: true,
        data: true,
        created_at: true,
      },
    });
  }

  @Patch(':id/lu')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiResponse({ status: 200, description: 'Notification marquée lue' })
  @ApiResponse({ status: 404, description: 'Non trouvée' })
  async markRead(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const notif = await this.prisma.notification.findFirst({
      where: { id, ...this.userScope(req), is_deleted: false },
    });
    if (!notif) throw new NotFoundException('Notification introuvable');
    return this.prisma.notification.update({
      where: { id },
      data: { lu: true, lu_at: new Date() },
    });
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marquer toutes mes notifications comme lues' })
  @ApiResponse({ status: 200, description: 'Toutes marquées lues' })
  async readAll(@Request() req: AuthenticatedRequest) {
    await this.prisma.notification.updateMany({
      where: { ...this.userScope(req), lu: false, is_deleted: false },
      data: { lu: true, lu_at: new Date() },
    });
    return { ok: true };
  }
}