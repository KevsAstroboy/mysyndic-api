import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'kofi.mensah@email.com',
    description: 'Adresse email ou téléphone',
  })
  @IsString()
  @MinLength(3)
  identifier: string;

  @ApiProperty({ example: 'Str0ngP@ss!123' })
  @IsString()
  password: string;
}