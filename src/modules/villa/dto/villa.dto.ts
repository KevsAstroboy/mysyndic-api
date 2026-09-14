import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

export class CreateVillaDto {
  @ApiProperty({ example: '15' })
  @IsString()
  @MinLength(1)
  numero: string;

  @ApiPropertyOptional({ example: 'Rue des Palmiers' })
  @IsOptional()
  @IsString()
  rue?: string;

  @ApiPropertyOptional({ example: 'Villa proche portail principal' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateVillaDto {
  @ApiPropertyOptional({ example: '15bis' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ example: 'Rue des Cocotiers' })
  @IsOptional()
  @IsString()
  rue?: string;

  @ApiPropertyOptional({ example: 'Villa avec piscine' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  is_active?: boolean;
}

export class AssignUserDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000104' })
  @IsFlexibleUuid()
  user_id: string;
}

export class CandidatureVillaDto {
  @ApiProperty({ example: '00000000-0000-0000-AAAA-000000000004' })
  @IsFlexibleUuid()
  villa_id: string;
}
