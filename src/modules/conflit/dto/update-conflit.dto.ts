import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class PrendreEnChargeDto {
  @ApiPropertyOptional({ example: 'Conflit pris en compte, médiation prévue.' })
  @IsString()
  @IsOptional()
  note_syndic?: string;
}

export class ResoudreConflitDto {
  @ApiProperty({ example: 'Accord trouvé entre les deux villas.' })
  @IsString()
  resolution_note: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  classe_sans_suite?: boolean;
}

export class NoteSyndicDto {
  @ApiProperty({ example: 'Suivi en cours chez les voisins.' })
  @IsString()
  note_syndic: string;
}