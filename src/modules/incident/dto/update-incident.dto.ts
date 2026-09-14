import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class PrendreEnChargeIncidentDto {
  @ApiPropertyOptional({ example: 'Équipe technique prévenue.' })
  @IsString()
  @IsOptional()
  note_syndic?: string;
}

export class ResoudreIncidentDto {
  @ApiProperty({ example: 'Panne réparée le jour même.' })
  @IsString()
  resolution_note: string;
}

export class NoteSyndicIncidentDto {
  @ApiProperty({ example: 'Suivi : devis en attente.' })
  @IsString()
  note_syndic: string;
}
