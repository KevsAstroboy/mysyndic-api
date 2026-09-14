import { ApiProperty } from '@nestjs/swagger';
import { IsFlexibleUuid } from '../../../common/decorators/is-flexible-uuid.decorator';

export class SwitchContextDto {
  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000201',
    description: 'id d un user_profil actif (voir GET /auth/profils)',
  })
  @IsFlexibleUuid()
  user_profil_id: string;
}
