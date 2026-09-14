import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendGroupeMessageDto {
  @ApiProperty({ example: 'Bonjour à toute la cité !' })
  @IsString()
  @IsNotEmpty()
  contenu: string;
}