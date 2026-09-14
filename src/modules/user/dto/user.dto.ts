import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  MinLength,
  MaxLength,
  IsEmail,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Kofi' })
  @IsOptional()
  @IsString()
  prenom?: string;

  @ApiPropertyOptional({ example: 'Mensah' })
  @IsOptional()
  @IsString()
  nom?: string;

  @ApiPropertyOptional({ example: '+225 07 12 34 56' })
  @IsOptional()
  @IsString()
  telephone?: string;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'Ama' })
  @IsString()
  @MinLength(2)
  prenom: string;

  @ApiProperty({ example: 'Sika' })
  @IsString()
  @MinLength(2)
  nom: string;

  @ApiProperty({ example: 'ama.staff@mysyndic.ci' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+225 07 99 99 99' })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiProperty({ example: 'SYNDIC', description: 'SYNDIC | CHEF_SECURITE' })
  @IsString()
  profil_code: string;

  /** Cité cible — réservé au super admin (bootstrap du premier syndic). */
  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  cite_id?: string;
}

export class CreateAdminDto {
  @ApiProperty({ example: 'Kouassi' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  prenom: string;

  @ApiProperty({ example: 'Konan' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nom: string;

  @ApiProperty({ example: 'admin.cite@mysyndic.ci' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+225 07 77 77 77' })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiProperty({ example: '00000000-0000-0000-AAAA-000000000001', description: 'Cité sur laquelle l ADMIN opère' })
  @IsFlexibleUuid()
  cite_id: string;
}

export class AssignProfilItemDto {
  @ApiProperty({ example: 'HABITANT', description: 'Code profil à assigner' })
  @IsString()
  profil_code: string;

  @ApiPropertyOptional({
    example: '00000000-0000-0000-AAAA-000000000001',
    description: 'Cité (obligatoire sauf SUPER_ADMIN global)',
  })
  @IsOptional()
  @IsFlexibleUuid()
  cite_id?: string;

  @ApiPropertyOptional({ example: 2, description: 'Ordre de priorité du profil' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order_priority?: number;
}

export class AssignProfilsDto {
  @ApiProperty({ type: [AssignProfilItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AssignProfilItemDto)
  profils: AssignProfilItemDto[];
}