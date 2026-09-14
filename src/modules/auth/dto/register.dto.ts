import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

export class RegisterDto {
  @ApiProperty({ example: 'Kofi' })
  @IsString()
  @MinLength(2)
  prenom: string;

  @ApiProperty({ example: 'Mensah' })
  @IsString()
  @MinLength(2)
  nom: string;

  @ApiProperty({ example: 'kofi.mensah@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+225 07 12 34 56' })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiProperty({ example: 'Str0ngP@ss!123' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Le mot de passe doit contenir minuscules, majuscules et chiffres',
  })
  password: string;

  @ApiProperty({ example: '00000000-0000-0000-AAAA-000000000004' })
  @IsFlexibleUuid()
  villa_id: string;
}