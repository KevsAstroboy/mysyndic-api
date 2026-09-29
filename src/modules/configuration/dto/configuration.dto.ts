import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateConfigurationDto {
  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  cotisation_mensuelle?: number;

  @ApiPropertyOptional({ example: 'https://pay.wave.com/m/synacassy1' })
  @IsOptional()
  @IsString()
  lien_wave?: string;

  @ApiPropertyOptional({ example: '+225 07 00 00 01' })
  @IsOptional()
  @IsString()
  telephone_syndic?: string;

  @ApiPropertyOptional({ example: '+225 07 00 00 02' })
  @IsOptional()
  @IsString()
  telephone_urgence?: string;

  @ApiPropertyOptional({ example: 'SUB_1234' })
  @IsOptional()
  @IsString()
  paystack_subaccount_code?: string;

  @ApiPropertyOptional({ example: 'SIMPLE', enum: ['SIMPLE', 'SPLIT'] })
  @IsOptional()
  @IsIn(['SIMPLE', 'SPLIT'])
  paystack_subaccount_mode?: 'SIMPLE' | 'SPLIT';

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  paystack_subaccount_split?: number;

  @ApiPropertyOptional({ example: 143 })
  @IsOptional()
  @IsInt()
  @Min(1)
  nombre_villas_attendu?: number;
}

export class ConfigurationResponseDto {
  id: string;
  cite_id: string;
  cotisation_mensuelle: number | null;
  lien_wave: string | null;
  telephone_syndic: string | null;
  telephone_urgence: string | null;
  paystack_subaccount_code: string | null;
  paystack_subaccount_mode: string | null;
  paystack_subaccount_split: number | null;
  nombre_villas_attendu: number | null;
  modifier?: { id: string; prenom: string; nom: string } | null;
}

/** Création d'un subaccount Paystack côté Paystack (super admin uniquement). */
export class CreateSubaccountDto {
  @ApiProperty({ example: 'Résidence Synacassy 1' })
  @IsString()
  business_name: string;

  @ApiProperty({ example: '044' })
  @IsString()
  settlement_bank: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  account_number: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  percentage_charge?: number;

  @ApiPropertyOptional({ example: 'SIMPLE', enum: ['SIMPLE', 'SPLIT'] })
  @IsOptional()
  @IsIn(['SIMPLE', 'SPLIT'])
  paystack_subaccount_mode?: 'SIMPLE' | 'SPLIT';

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  paystack_subaccount_split?: number;

  @ApiPropertyOptional({ example: 'germain@mysyndic.ci' })
  @IsOptional()
  @IsEmail()
  primary_contact_email?: string;
}