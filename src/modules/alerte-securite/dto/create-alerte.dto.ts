import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

/**
 * DTO multipart. En `multipart/form-data` (avec photo), tous les champs
 * arrivent en STRING côté Nest : `@IsInt()` échouerait sur un `"1"`.
 * On valide en string puis on convertit explicitement dans le service.
 */
export class CreateAlerteDto {
  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000005' })
  @IsFlexibleUuid()
  @IsOptional()
  villa_id?: string;

  @ApiPropertyOptional({ example: 1 })
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  @IsOptional()
  motif_id?: string;

  @ApiPropertyOptional({ example: 'Intrusion détectée près du portail nord.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'alertes/cite_id/uuid.jpg' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  photo_file_path?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  silencieuse?: boolean | string;
}