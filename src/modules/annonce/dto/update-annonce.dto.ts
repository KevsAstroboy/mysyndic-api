import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAnnonceDto } from './create-annonce.dto';

export class UpdateAnnonceDto extends PartialType(CreateAnnonceDto) {
  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  est_epinglee?: boolean;
}