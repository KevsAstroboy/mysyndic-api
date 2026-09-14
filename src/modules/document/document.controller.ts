import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { DocumentService } from './document.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@ApiTags('Documents')
@Controller('documents')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  @RequireFeature('DOCUMENT_READ')
  @ApiOperation({ summary: 'Lister les documents de ma cité' })
  @ApiResponse({ status: 200, description: 'Liste des documents' })
  findAll(@Request() req: AuthenticatedRequest) {
    return this.documentService.findAll(req.user.cite_id!);
  }

  @Post()
  @RequireFeature('DOCUMENT_UPLOAD')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Uploader un document' })
  @ApiResponse({ status: 201, description: 'Document uploadé' })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.documentService.upload(req.user.cite_id!, req.user.sub, file, dto);
  }

  @Get('types')
  @ApiOperation({ summary: 'Types de document (référentiel)' })
  @ApiResponse({ status: 200, description: 'Liste des types' })
  getTypes() {
    return this.documentService.getTypes();
  }

  @Get(':id/download')
  @RequireFeature('DOCUMENT_READ')
  @ApiOperation({ summary: 'Télécharger un document (URL pré-signée)' })
  @ApiResponse({ status: 200, description: 'URL pré-signée' })
  download(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.documentService.download(req.user.cite_id!, id);
  }

  @Delete(':id')
  @RequireFeature('DOCUMENT_DELETE')
  @ApiOperation({ summary: 'Supprimer un document (soft-delete)' })
  @ApiResponse({ status: 200, description: 'Document supprimé' })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.documentService.remove(req.user.cite_id!, id, req.user.sub);
  }
}