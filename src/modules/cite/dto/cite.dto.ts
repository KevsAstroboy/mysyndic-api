import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCiteDto {
  @ApiProperty({ example: 'Citadelle Le Plateau' })
  @IsString()
  @MinLength(2)
  nom: string;

  @ApiPropertyOptional({ example: 'Abidjan — Plateau' })
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiPropertyOptional({ example: "Côte d'Ivoire" })
  @IsOptional()
  @IsString()
  pays?: string;
}

export class UpdateCiteDto {
  @ApiPropertyOptional({ example: 'Citadelle Le Plateau 2' })
  @IsOptional()
  @IsString()
  nom?: string;

  @ApiPropertyOptional({ example: 'Abidjan — Plateau' })
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiPropertyOptional({ example: "Côte d'Ivoire" })
  @IsOptional()
  @IsString()
  pays?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  is_active?: boolean;
}