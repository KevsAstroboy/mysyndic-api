import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

export class InitPaystackDto {
  @ApiProperty({ example: '00000000-0000-0000-AAAA-000000000004' })
  @IsFlexibleUuid()
  villa_id: string;

  @ApiProperty({ example: '2026-09' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'mois doit être au format YYYY-MM',
  })
  mois: string;
}

export const CANAUX_MANUELS = [
  'WAVE_MANUEL',
  'ORANGE_MANUEL',
  'MTN_MANUEL',
  'CASH',
] as const;

export enum CanalCode {
  WAVE_MANUEL = 'WAVE_MANUEL',
  ORANGE_MANUEL = 'ORANGE_MANUEL',
  MTN_MANUEL = 'MTN_MANUEL',
  CASH = 'CASH',
}

export class PaiementManuelDto {
  @ApiProperty({ example: '00000000-0000-0000-AAAA-000000000004' })
  @IsFlexibleUuid()
  villa_id: string;

  @ApiProperty({
    example: ['2026-09', '2026-10'],
    description: 'Mois régularisables (multipart : répéter le champ mois)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' && value.includes(',')
      ? value.split(',')
      : typeof value === 'string'
        ? [value]
        : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    each: true,
    message: 'chaque mois doit être au format YYYY-MM',
  })
  mois: string[];

  @ApiProperty({ example: 25000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  montant: number;

  @ApiProperty({ example: 'WAVE_MANUEL', enum: CANAUX_MANUELS })
  @IsIn(CANAUX_MANUELS)
  canal: string;

  @ApiPropertyOptional({ example: 'REF-WAVE-2026-09' })
  @IsOptional()
  @IsString()
  reference_externe?: string;

  @ApiPropertyOptional({
    example: 'https://.../preuve.jpg',
    description: 'Déprécié : préférer le fichier « preuve » en multipart.',
  })
  @IsOptional()
  @IsString()
  preuve_url?: string;

  @ApiPropertyOptional({ example: 'Régularisation septembre' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class PaiementRechercheDto {
  @ApiPropertyOptional({ example: '2026-09' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  mois?: string;

  @ApiPropertyOptional({ example: 'CONFIRME' })
  @IsOptional()
  @IsString()
  statut?: string;

  @ApiPropertyOptional({ example: 'WAVE_MANUEL' })
  @IsOptional()
  @IsString()
  canal?: string;

  @ApiPropertyOptional({ example: '00000000-0000-0000-AAAA-000000000004' })
  @IsOptional()
  @IsFlexibleUuid()
  villa_id?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}