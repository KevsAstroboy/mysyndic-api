import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @ApiPropertyOptional({
    example: 'Réunion des habitants samedi à 10h devant la piscine.',
    description:
      'Légende du post. Optionnelle si au moins un média est fourni.',
  })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  contenu?: string;

  @ApiPropertyOptional({
    example: '[{"largeur":1080,"hauteur":1350},{"largeur":1080,"hauteur":1080}]',
    description:
      "Métadonnées des médias (JSON array aligné sur l'ordre de `media`) : " +
      "{ largeur, hauteur, duree_sec }. Optionnel, sert à réserver les proportions.",
  })
  @IsString()
  @IsOptional()
  media_meta?: string;
}
