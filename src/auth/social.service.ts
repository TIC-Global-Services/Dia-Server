import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SettingsService } from '../settings/settings.service.js';
import type { SocialProvider } from './dto/auth.dto.js';

export interface SocialProfile {
  provider: SocialProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

interface ProviderSpec {
  issuer: string[];
  jwksUrl: string;
  audiences: (settings: SettingsService) => string;
}

// Google signs ID tokens (OpenID Connect). It is the only social sign-in offered.
const PROVIDERS: Record<SocialProvider, ProviderSpec> = {
  google: {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    audiences: (c) => c.get('GOOGLE_CLIENT_IDS') ?? '',
  },
};

/** Verifies the ID token a mobile or web client got from the provider's SDK. */
@Injectable()
export class SocialService {
  private readonly keySets = new Map<
    SocialProvider,
    ReturnType<typeof createRemoteJWKSet>
  >();

  constructor(private readonly settings: SettingsService) {}

  async verify(
    provider: SocialProvider,
    idToken: string,
    nonce?: string,
  ): Promise<SocialProfile> {
    const spec = PROVIDERS[provider];
    const audience = spec
      .audiences(this.settings)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (audience.length === 0) {
      throw new BadRequestException(`${provider} login is not enabled`);
    }

    let keys = this.keySets.get(provider);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(spec.jwksUrl));
      this.keySets.set(provider, keys);
    }

    try {
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: spec.issuer,
        audience,
        algorithms: ['RS256'],
      });
      if (nonce && payload.nonce !== nonce) throw new Error('nonce mismatch');
      if (!payload.sub) throw new Error('no subject');
      return {
        provider,
        subject: payload.sub,
        email:
          typeof payload.email === 'string'
            ? payload.email.toLowerCase()
            : null,
        // Apple sends the boolean as the string "true".
        emailVerified:
          payload.email_verified === true || payload.email_verified === 'true',
        name: typeof payload.name === 'string' ? payload.name : null,
      };
    } catch {
      throw new UnauthorizedException(`Invalid ${provider} token`);
    }
  }
}
