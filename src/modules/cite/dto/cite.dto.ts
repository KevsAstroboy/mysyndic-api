import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ example: 143, description: 'Nombre de villas attendu (création de la cité)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  nombre_villas_attendu?: number;

  @ApiPropertyOptional({ example: 'SUB_1234', description: 'Code subaccount Paystack éventuel' })
  @IsOptional()
  @IsString()
  paystack_subaccount_code?: string;
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

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsInt()
  @Min(1)
  nombre_villas_attendu?: number;

  @ApiPropertyOptional({ example: 'SUB_1234' })
  @IsOptional()
  @IsString()
  paystack_subaccount_code?: string;
}