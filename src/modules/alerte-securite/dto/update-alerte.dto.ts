import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateStatutAlerteDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  statut_id: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  escalade?: boolean;
}

export class ResoudreAlerteDto {
  @ApiPropertyOptional({ example: 'Alerte traitée, agent intervenu.' })
  @IsString()
  @IsOptional()
  description?: string;
}