import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      return null as TUser;
    }
    return user;
  }
}
