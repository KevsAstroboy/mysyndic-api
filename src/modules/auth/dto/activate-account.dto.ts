import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class ActivateAccountDto {
  @ApiProperty({ example: 'kofi.mensah@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'Le code doit contenir exactement 6 caractères' })
  otp_code: string;
}

export class ResendActivationOtpDto {
  @ApiProperty({ example: 'kofi.mensah@email.com' })
  @IsEmail()
  email: string;
}