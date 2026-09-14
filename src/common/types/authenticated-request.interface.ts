import { Request } from 'express';

export interface JwtUser {
  sub: string;
  email: string;
  role: string;
  cite_id: string | null;
  must_change_password: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: JwtUser;
}