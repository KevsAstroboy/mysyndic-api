import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class CreateAnnonceDto {
  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  categorie_id?: number;

  @ApiProperty({ example: 'Réunion du conseil syndical' })
  @IsString()
  @MaxLength(255)
  titre: string;

  @ApiProperty({ example: 'Réunion jeudi à 19h à la salle commune.' })
  @IsString()
  contenu: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  est_epinglee?: boolean;
}