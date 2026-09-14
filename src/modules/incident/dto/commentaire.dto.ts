import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CommentaireDto {
  @ApiProperty({ example: 'Je confirme, la panne persiste.' })
  @IsString()
  @MaxLength(2000)
  texte: string;
}