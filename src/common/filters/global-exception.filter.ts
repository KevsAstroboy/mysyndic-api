import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

const FK_LABELS: Record<string, string> = {
  user_id: 'Utilisateur',
  cite_id: 'Cité',
  villa_id: 'Villa',
  profil_id: 'Profil',
  feature_id: 'Permission',
  groupe_id: 'Groupe',
  expediteur_id: 'Expéditeur',
  destinataire_id: 'Destinataire',
  declarant_id: 'Déclarant',
  auteur_id: 'Auteur',
  incident_id: 'Incident',
  parent_id: 'Parent',
  paiement_id: 'Paiement',
  statut_id: 'Statut',
  canal_id: 'Canal',
  motif_id: 'Motif',
  categorie_id: 'Catégorie',
  entite_id: 'Entité',
  created_by: 'Créateur',
  updated_by: 'Éditeur',
  deleted_by: 'Supprimeur',
};

function extractFkColumn(rawField: string): string {
  const cleaned = rawField.replace(/\s*\(.*\)\s*/, '');
  const withoutFkey = cleaned.replace(/_fkey$/, '');
  const parts = withoutFkey.split('_');
  if (parts.length >= 2) {
    return parts.slice(-2).join('_');
  }
  return rawField;
}

function findLabelBySuffix(rawField: string): string | undefined {
  for (const key of Object.keys(FK_LABELS)) {
    if (rawField.includes(key)) return FK_LABELS[key];
  }
  return undefined;
}

function handlePrismaError(
  exception: Prisma.PrismaClientKnownRequestError,
  request: Request,
  response: Response,
  logger: Logger,
): boolean {
  const code = exception.code;

  if (code === 'P2002') {
    const target = (exception.meta?.target as string[]) ?? [];
    const field = target.length > 0 ? target[0] : 'inconnu';
    const label = FK_LABELS[field] ?? field;

    response.status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      message: `${label} existe déjà`,
      error: 'Conflict',
      detail: `La valeur du champ \`${field}\` est déjà utilisée`,
      timestamp: new Date().toISOString(),
      requestId: (request as { id?: string }).id,
      path: request.url,
    });
    return true;
  }

  if (code === 'P2003') {
    const rawField = (exception.meta?.field_name as string) ?? 'inconnu';
    const column = extractFkColumn(rawField);
    const label = FK_LABELS[column] ?? findLabelBySuffix(rawField) ?? column;

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: `${label} introuvable`,
      error: 'Bad Request',
      detail: `La référence \`${column}\` n'existe pas`,
      timestamp: new Date().toISOString(),
      requestId: (request as { id?: string }).id,
      path: request.url,
    });
    return true;
  }

  if (code === 'P2025') {
    response.status(HttpStatus.NOT_FOUND).json({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Enregistrement introuvable',
      error: 'Not Found',
      detail: exception.message,
      timestamp: new Date().toISOString(),
      requestId: (request as { id?: string }).id,
      path: request.url,
    });
    return true;
  }

  if (code === 'P2014') {
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Relation requise non satisfaite',
      error: 'Bad Request',
      detail: exception.message,
      timestamp: new Date().toISOString(),
      requestId: (request as { id?: string }).id,
      path: request.url,
    });
    return true;
  }

  if (code === 'P2000') {
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Valeur trop longue',
      error: 'Bad Request',
      detail: exception.message,
      timestamp: new Date().toISOString(),
      requestId: (request as { id?: string }).id,
      path: request.url,
    });
    return true;
  }

  logger.error(
    `Prisma error ${code} on ${request.method} ${request.url}`,
    exception.message,
  );

  return false;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const handled = handlePrismaError(exception, request, response, this.logger);
      if (handled) return;
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const req = request as { id?: string };
      if (req.id && body && typeof body === 'object') {
        (body as Record<string, unknown>).requestId = req.id;
      }
      return response.status(exception.getStatus()).json(body);
    }

    this.logger.error(
      `${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erreur interne du serveur',
      timestamp: new Date().toISOString(),
      requestId: (request as { id?: string }).id,
      path: request.url,
    });
  }
}