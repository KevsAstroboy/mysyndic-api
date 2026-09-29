import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { MessageService } from './message.service';
import { SendPrivateMessageDto } from './dto/send-private-message.dto';
import { SendGroupeMessageDto } from './dto/send-groupe-message.dto';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Lister mes conversations' })
  @ApiResponse({ status: 200, description: 'Conversations avec dernier message + non-lus' })
  getConversations(@Request() req: AuthenticatedRequest) {
    return this.messageService.getConversations(req.user.cite_id!, req.user.sub);
  }

  @Get('presence')
  @ApiOperation({
    summary: 'Statut en ligne/hors ligne de plusieurs utilisateurs',
  })
  @ApiResponse({ status: 200, description: '{ userId: boolean }' })
  presence(@Query('user_ids') user_ids?: string) {
    const ids = (user_ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.messageService.presence(ids);
  }

  @Get('conversations/:userId')
  @ApiOperation({ summary: "Historique d'une conversation (privée ou groupe)" })
  @ApiResponse({ status: 200, description: 'Messages du thread' })
  getThread(
    @Param('userId') userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.messageService.getThread(
      req.user.cite_id!,
      req.user.sub,
      userId,
    );
  }

  @Get('contacts')
  @ApiOperation({ summary: 'Contacts de la cité (syndics, staff, habitants) pour messagerie' })
  @ApiResponse({ status: 200, description: 'Liste des contacts' })
  getContacts(@Request() req: AuthenticatedRequest) {
    return this.messageService.getContacts(req.user.cite_id!, req.user.sub);
  }

  @Post('private')
  @RequireFeature('MESSAGE_SEND_PRIVATE')
  @ApiOperation({ summary: 'Envoyer un message privé' })
  @ApiResponse({ status: 201, description: 'Message envoyé' })
  @ApiResponse({ status: 400, description: 'Destinataire hors cité' })
  sendPrivate(
    @Body() dto: SendPrivateMessageDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.messageService.sendPrivate(req.user.cite_id!, req.user.sub, dto);
  }

  @Post('groupe')
  @RequireFeature('MESSAGE_SEND_GROUPE')
  @ApiOperation({ summary: 'Envoyer un message au groupe de la cité' })
  @ApiResponse({ status: 201, description: 'Message diffusé' })
  sendGroupe(
    @Body() dto: SendGroupeMessageDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.messageService.sendGroupe(req.user.cite_id!, req.user.sub, dto);
  }

  @Patch('conversations/:threadId/lu')
  @ApiOperation({ summary: "Marquer comme lus tous les messages d'un thread" })
  @ApiResponse({ status: 200, description: 'Thread marqué lu' })
  markThreadRead(
    @Param('threadId') threadId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.messageService.markThreadRead(
      req.user.cite_id!,
      req.user.sub,
      threadId,
    );
  }

  @Patch(':id/lu')
  @ApiOperation({ summary: 'Marquer un message comme lu' })
  @ApiResponse({ status: 200, description: 'Message marqué lu' })
  markRead(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.messageService.markRead(req.user.cite_id!, req.user.sub, id);
  }

  @Delete(':id')
  @RequireFeature('MESSAGE_DELETE_OWN')
  @ApiOperation({ summary: 'Supprimer son message (soft-delete)' })
  @ApiResponse({ status: 200, description: 'Message supprimé' })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.messageService.removeMessage(req.user.cite_id!, req.user.sub, id);
  }
}