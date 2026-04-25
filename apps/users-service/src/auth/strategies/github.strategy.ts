import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      clientID: configService.get<string>('oauth.github.clientId')!,
      clientSecret: configService.get<string>('oauth.github.clientSecret')!,
      callbackURL: configService.get<string>('oauth.github.callbackUrl')!,
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: Function,
  ) {
    const { id, emails, photos, displayName } = profile;

    // GitHub may not always return an email if it's set to private
    const email = emails?.[0]?.value;
    if (!email) {
      return done(
        new Error(
          'No email returned from GitHub. Make sure your GitHub email is public.',
        ),
        null,
      );
    }

    // GitHub returns a single display name — split it best-effort
    const [firstName, ...rest] = (displayName || email).split(' ');
    const lastName = rest.join(' ') || '';

    const user = await this.usersService.findOrCreateOAuthUser({
      email,
      firstName,
      lastName,
      avatarUrl: photos?.[0]?.value,
      provider: 'GITHUB',
      providerId: String(id),
    });

    done(null, user);
  }
}
