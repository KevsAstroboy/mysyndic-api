import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, MaxLength } from 'class-validator';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

export class CreateConflitDto {
  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000005' })
  @IsFlexibleUuid()
  @IsOptional()
  villa_declarant_id?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  categorie_id?: number;

  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000006' })
  @IsFlexibleUuid()
  @IsOptional()
  villa_ciblee_id?: string;

  @ApiProperty({ example: 'B12' })
  @IsString()
  @MaxLength(50)
  villa_ciblee_num: string;

  @ApiProperty({ example: 'Bruits de fête après minuit.' })
  @IsString()
  description: string;
}