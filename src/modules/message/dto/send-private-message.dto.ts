import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

export class SendPrivateMessageDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000002' })
  @IsFlexibleUuid()
  @IsNotEmpty()
  destinataire_id: string;

  @ApiProperty({ example: 'Bonsoir, comment allez-vous ?' })
  @IsString()
  @IsNotEmpty()
  contenu: string;
}