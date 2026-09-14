import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000104' })
  id: string;

  @ApiProperty({ example: 'Kofi' })
  prenom: string;

  @ApiProperty({ example: 'Mensah' })
  nom: string;

  @ApiProperty({ example: 'kofi.mensah@email.com' })
  email: string;

  @ApiPropertyOptional({ example: '+225 07 12 34 56' })
  telephone?: string | null;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiProperty({ example: false, description: 'Force le changement de mdp' })
  must_change_password: boolean;
}

export class AuthProfilDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000201' })
  userProfilId: string;

  @ApiProperty({ example: 5 })
  profilId: number;

  @ApiProperty({ example: 'Habitant' })
  libelle: string;

  @ApiProperty({ example: 'HABITANT' })
  code: string;

  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000001' })
  citeId?: string | null;

  @ApiPropertyOptional({ example: 'Cité des Flamboyants' })
  citeNom?: string | null;

  @ApiProperty({ example: 1 })
  orderPriority: number;
}

export class AuthResponseDto {
  @ApiProperty()
  user: AuthUserDto;

  @ApiProperty({ type: [AuthProfilDto] })
  profils: AuthProfilDto[];

  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000201' })
  profil_actif_user_profil_id?: string | null;

  @ApiProperty({ example: ['AUTH_LOGIN', 'PAIEMENT_READ_OWN'] })
  features: string[];

  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIuLi4iLCJyb2xlIjoiSEFCSVRBTlQiLCJjaXRlX2lkIjoiLi4uIiwiaWF0IjoxNzE2MDAwMDAwLCJleHAiOjE3MTY2MDQ4MDB9.abc123',
  })
  access_token: string;

  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIuLi4iLCJpYXQiOjE3MTYwMDAwMDAsImV4cCI6MTcxNjYwNDgwMH0.def456',
  })
  refresh_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: string;
}