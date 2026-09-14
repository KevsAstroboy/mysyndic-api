import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, MaxLength } from 'class-validator';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

export class CreateIncidentDto {
  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000005' })
  @IsFlexibleUuid()
  @IsOptional()
  villa_id?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  categorie_id?: number;

  @ApiPropertyOptional({ example: "Panne d'éclairage rue des flamboyants" })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  titre?: string;

  @ApiProperty({ example: "Le lampadaire ne s'allume plus depuis 2 jours." })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 'incidents/cite_id/uuid.jpg' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  photo_file_path?: string;
}