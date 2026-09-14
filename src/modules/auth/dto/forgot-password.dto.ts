import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'kofi.mensah@email.com' })
  @IsEmail()
  email: string;
}