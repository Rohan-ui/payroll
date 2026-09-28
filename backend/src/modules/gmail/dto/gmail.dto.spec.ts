import { ValidationPipe } from '@nestjs/common';
import { GmailInboxQueryDto, GmailOAuthCallbackDto } from './gmail.dto';

describe('GmailOAuthCallbackDto', () => {
  it('accepts the issuer parameter Google sends with the OAuth callback', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    await expect(
      pipe.transform(
        {
          state: 'ROsZA82214NareEpgtKgXcm3IOMkR-kl33-ELlKoAq0',
          iss: 'https://accounts.google.com',
          code: 'redacted-authorization-code',
          scope: 'email https://mail.google.com/ openid',
          authuser: '0',
          prompt: 'consent',
        },
        { type: 'query', metatype: GmailOAuthCallbackDto },
      ),
    ).resolves.toBeInstanceOf(GmailOAuthCallbackDto);
  });

  it('allows only supported Gmail folders', async () => {
    const pipe = new ValidationPipe({ transform: true });

    await expect(
      pipe.transform({ folder: 'sent', page: '1', limit: '25' }, { type: 'query', metatype: GmailInboxQueryDto }),
    ).resolves.toMatchObject({ folder: 'sent', page: 1, limit: 25 });
    await expect(
      pipe.transform({ folder: 'trash', page: '1', limit: '25' }, { type: 'query', metatype: GmailInboxQueryDto }),
    ).rejects.toBeDefined();
  });
});
