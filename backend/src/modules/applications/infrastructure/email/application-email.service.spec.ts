import { InternalServerErrorException } from '@nestjs/common';

import { ApplicationEmailService } from './application-email.service.js';

interface SentEmail {
  from?: string;
  to: string;
  subject: string;
  html: string;
}

function createService(
  config: Record<string, string | undefined> = {},
  sendResult: unknown = { data: { id: 'email-id' }, error: null },
) {
  const values: Record<string, string | undefined> = {
    'email.resendApiKey': 'test-key',
    'email.frontendUrl': 'https://portal.example.com',
    'email.nodeEnv': 'test',
    ...config,
  };
  const configService = { get: (key: string) => values[key] };
  const service = new ApplicationEmailService(configService as never);
  const send = vi.fn(async (_payload: SentEmail) => sendResult);

  Object.defineProperty(service, 'resend', {
    value: { emails: { send } },
  });

  return { service, send };
}

const OVERRIDE = 'dev-inbox@example.com';

describe('ApplicationEmailService', () => {
  it('sends the review token to the supplied email address', async () => {
    const { service, send } = createService();

    await service.sendReviewEmail(
      'owner@example.com',
      'opaque-review-token',
      'Engineering',
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com' }),
    );
    expect(send.mock.calls[0][0].html).not.toContain('Development copy');
  });

  it('escapes an applicant-supplied training title in the HTML body', async () => {
    const { service, send } = createService();

    await service.sendReviewEmail(
      'owner@example.com',
      'opaque-review-token',
      '<a href="https://evil.example">Claim prize</a>',
    );

    const html = send.mock.calls[0][0].html;
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Claim prize&lt;/a&gt;');
    expect(html).toContain('https://portal.example.com/application-review/opaque-review-token');
  });

  it('explains that the application and account are completed only after the review is submitted', async () => {
    const { service, send } = createService();

    await service.sendReviewEmail('owner@example.com', 'opaque-review-token', 'Engineering');

    const { subject, html } = send.mock.calls[0][0];
    const text = html.replace(/\s+/g, ' ');
    expect(subject).toBe('We received your CV – review and submit your application');
    expect(subject).not.toMatch(/account is ready/i);
    expect(text).toContain('applicant account has not been created yet');
    expect(text).toContain('Your application has not been submitted yet');
    expect(text).not.toMatch(/created your applicant account/i);
  });

  describe('development recipient override', () => {
    it('delivers to the override inbox for any applicant', async () => {
      const { service, send } = createService({
        'email.applicationReviewEmailOverride': ` ${OVERRIDE.toUpperCase()} `,
      });

      await service.sendReviewEmail('first@example.com', 'token-for-first', 'Engineering');
      await service.sendReviewEmail('second@example.org', 'token-for-second', 'Design');

      expect(send).toHaveBeenCalledTimes(2);
      const [first, second] = send.mock.calls.map(([payload]) => payload);
      expect(first.to).toBe(OVERRIDE);
      expect(second.to).toBe(OVERRIDE);
    });

    it('sends exactly the applicant-facing email, with no trace of the redirection', async () => {
      const normal = createService();
      const redirected = createService({ 'email.applicationReviewEmailOverride': OVERRIDE });

      await normal.service.sendReviewEmail('first@example.com', 'token-for-first', 'Engineering');
      await redirected.service.sendReviewEmail('first@example.com', 'token-for-first', 'Engineering');

      const normalEmail = normal.send.mock.calls[0][0];
      const redirectedEmail = redirected.send.mock.calls[0][0];

      // Only the delivery address differs.
      expect(redirectedEmail.subject).toBe(normalEmail.subject);
      expect(redirectedEmail.html).toBe(normalEmail.html);
      expect(Object.keys(redirectedEmail).sort()).toEqual(Object.keys(normalEmail).sort());

      for (const content of [redirectedEmail.subject, redirectedEmail.html]) {
        expect(content).not.toContain('first@example.com');
        expect(content).not.toContain(OVERRIDE);
        expect(content).not.toMatch(/development|redirect|testing|intended applicant/i);
      }
    });

    it('keeps each email bound to its own application review link', async () => {
      const { service, send } = createService({
        'email.applicationReviewEmailOverride': OVERRIDE,
      });

      await service.sendReviewEmail('first@example.com', 'token-for-first', 'Engineering');
      await service.sendReviewEmail('second@example.org', 'token-for-second', 'Design');

      const [first, second] = send.mock.calls.map(([payload]) => payload.html);
      expect(first).toContain('https://portal.example.com/application-review/token-for-first');
      expect(first).not.toContain('token-for-second');
      expect(second).toContain('https://portal.example.com/application-review/token-for-second');
      expect(second).not.toContain('token-for-first');
    });

    it.each([undefined, '', '   '])('uses the applicant address when the override is unset (%j)', async (value) => {
      const { service, send } = createService({
        'email.applicationReviewEmailOverride': value,
      });

      await service.sendReviewEmail('applicant@example.com', 'token', 'Engineering');

      expect(send.mock.calls[0][0].to).toBe('applicant@example.com');
      expect(send.mock.calls[0][0].html).not.toContain('Development copy');
    });

    it('refuses to start with an invalid override address', () => {
      expect(() => createService({ 'email.applicationReviewEmailOverride': 'not-an-email' }))
        .toThrow(InternalServerErrorException);
    });

    it('refuses to start with an override in production', () => {
      expect(() => createService({
        'email.applicationReviewEmailOverride': OVERRIDE,
        'email.nodeEnv': 'production',
      })).toThrow('must not be set in production');
    });

    it.each([undefined, '', 'staging', 'prod'])(
      'fails closed when NODE_ENV is not development or test (%j)',
      (nodeEnv) => {
        expect(() => createService({
          'email.applicationReviewEmailOverride': OVERRIDE,
          'email.nodeEnv': nodeEnv,
        })).toThrow('requires NODE_ENV=development or NODE_ENV=test');
      },
    );

    it('honors the override in development', async () => {
      const { service, send } = createService({
        'email.applicationReviewEmailOverride': OVERRIDE,
        'email.nodeEnv': 'development',
      });

      await service.sendReviewEmail('applicant@example.com', 'token', 'Engineering');
      expect(send.mock.calls[0][0].to).toBe(OVERRIDE);
    });

    it('needs no NODE_ENV when the override is unset (normal production path)', async () => {
      const { service, send } = createService({ 'email.nodeEnv': 'production', 'email.from': 'no-reply@portal.example.com' });

      await service.sendReviewEmail('applicant@example.com', 'token', 'Engineering');
      expect(send.mock.calls[0][0].to).toBe('applicant@example.com');
    });
  });

  describe('delivery failures are never reported as success', () => {
    it.each([
      ['a provider error', { data: null, error: { name: 'validation_error', message: 'testing mode' } }],
      ['no message id', { data: null, error: null }],
    ])('throws when Resend returns %s', async (_label, result) => {
      const { service } = createService({ 'email.applicationReviewEmailOverride': OVERRIDE }, result);

      await expect(service.sendReviewEmail('applicant@example.com', 'token', 'Engineering'))
        .rejects.toThrow('Unable to send the review email');
    });
  });

  describe('sender', () => {
    it('uses the configured verified-domain sender', async () => {
      const { service, send } = createService({ 'email.from': ' Internship Portal <no-reply@portal.example.com> ' });
      await service.sendReviewEmail('owner@example.com', 'token', 'Engineering');
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'Internship Portal <no-reply@portal.example.com>' }));
    });

    it('falls back to the Resend test sender outside production', async () => {
      const { service, send } = createService();
      await service.sendReviewEmail('owner@example.com', 'token', 'Engineering');
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'Internship Portal <onboarding@resend.dev>' }));
    });

    it('refuses to start in production without a sender', () => {
      expect(() => createService({ 'email.nodeEnv': 'production' })).toThrow(InternalServerErrorException);
    });

    it.each(['not-an-address', 'Name <bad>', 'a@b.co\nBcc: x@y.z'])('rejects the malformed sender %s', (from) => {
      expect(() => createService({ 'email.from': from })).toThrow(InternalServerErrorException);
    });

    it('starts in production with a sender configured', () => {
      expect(() => createService({ 'email.nodeEnv': 'production', 'email.from': 'no-reply@portal.example.com' })).not.toThrow();
    });
  });
});
