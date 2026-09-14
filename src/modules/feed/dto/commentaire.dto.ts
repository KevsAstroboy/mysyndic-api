import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CommentaireDto {
  @ApiProperty({ example: 'Trop belle cette photo !' })
  @IsString()
  @MaxLength(2000)
  texte: string;
}
