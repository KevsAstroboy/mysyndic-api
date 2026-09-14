export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  cite_id: string | null;
  must_change_password: boolean;
  iat?: number;
  exp?: number;
}