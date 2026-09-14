import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class UpdateProfilFeaturesDto {
  @ApiProperty({ example: ['AUTH_LOGIN', 'PAIEMENT_READ_ALL'], type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  features: string[];
}