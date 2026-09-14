import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadDocumentDto {
  @ApiProperty({ example: 'Règlement intérieur' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  titre: string;
}