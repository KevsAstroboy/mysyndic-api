import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Str0ngP@ss!123' })
  @IsString()
  old_password: string;

  @ApiProperty({ example: 'NouveauP@ss!456' })
  @IsString()
  @MinLength(8)
  new_password: string;
}