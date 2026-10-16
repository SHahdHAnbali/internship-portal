import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Resend } from 'resend';

import { normalizeReviewEmail } from '../../domain/types/review-email.js';

@Injectable()
export class ApplicationEmailService {
  private readonly logger = new Logger(ApplicationEmailService.name);
  private readonly resend: Resend;
  private readonly frontendUrl: string;
  // Development-only delivery inbox. It changes where the email is delivered,
  // never the applicant's stored review email or account identity.
  private readonly recipientOverride: string | null;
  private readonly from: string;

  constructor(
    private readonly configService:
      ConfigService,
  ) {
    const apiKey =
      this.configService.get<string>(
        'email.resendApiKey',
      );

    this.frontendUrl =
      this.configService.get<string>(
        'email.frontendUrl',
      ) ??
      'http://localhost:5173';

    if (!apiKey) {
      throw new InternalServerErrorException(
        'Resend API key is missing',
      );
    }

    this.resend =
      new Resend(apiKey);

    this.recipientOverride =
      this.resolveRecipientOverride();

    this.from =
      this.resolveSender();
  }

  // email is the applicant's normalized review email (applications.review_email).
  async sendReviewEmail(
    email: string,
    reviewToken: string,
    rawInternshipTitle: string,
  ) {
    // The override changes delivery only. The content is identical to what the
    // applicant would receive and never mentions the redirection.
    const recipient =
      this.recipientOverride ?? email;

    // The training title can be applicant-supplied ("Other"), so every value
    // interpolated into the HTML body is escaped.
    const internshipTitle =
      escapeHtml(rawInternshipTitle);

    const reviewUrl =
      escapeHtml(
        `${this.frontendUrl}/application-review/${encodeURIComponent(reviewToken)}`,
      );

    const { data, error } =
      await this.resend.emails.send({
        from:
          this.from,

        to:
          recipient,

        subject:
          'We received your CV – review and submit your application',

        html: `
          <div
            style="
              font-family: Arial, sans-serif;
              max-width: 620px;
              margin: 0 auto;
              padding: 24px;
              color: #111827;
              line-height: 1.6;
            "
          >
            <h2 style="margin-bottom: 16px;">
              Please review and submit your application
            </h2>

            <p>
              Thank you for applying for
              <strong>${internshipTitle}</strong>.
            </p>

            <p>
              We received your CV, and our system
              extracted your information from it.
              Please open the link below to review
              that information, correct any mistakes,
              and submit your application.
            </p>

            <p>
              <strong>Your application has not been
              submitted yet, and your applicant account
              has not been created yet.</strong>
              Both happen only after you submit the
              review form.
            </p>

            <div
              style="
                background: #f3f4f6;
                padding: 16px;
                border-radius: 8px;
                margin: 24px 0;
              "
            >
              <p style="margin: 0 0 8px 0;">
                <strong>Training:</strong>
                ${internshipTitle}
              </p>

              <p style="margin: 0;">
                Please review your personal information,
                education, experience, skills, languages,
                certifications, and training preference.
              </p>
            </div>

            <p style="margin: 30px 0;">
              <a
                href="${reviewUrl}"
                style="
                  display: inline-block;
                  background: #111827;
                  color: #ffffff;
                  padding: 12px 20px;
                  text-decoration: none;
                  border-radius: 6px;
                  font-weight: 600;
                "
              >
                Review and Submit My Application
              </a>
            </p>

            <p>
              When you submit the review form, your
              applicant account is created and your
              application is sent to the HR team for
              consideration.
            </p>

            <p>
              This link can be used once and expires
              in 24 hours.
            </p>

            <p>
              If the button does not work,
              copy and open this link:
            </p>

            <p
              style="
                word-break: break-all;
                font-size: 14px;
                color: #4b5563;
              "
            >
              ${reviewUrl}
            </p>

            <hr
              style="
                margin: 32px 0;
                border: none;
                border-top: 1px solid #e5e7eb;
              "
            />

            <p
              style="
                font-size: 13px;
                color: #6b7280;
              "
            >
              This message was sent as part of your
              internship application process. If you
              did not apply, you can ignore this email.
            </p>
          </div>
        `,
      });

    // Only an accepted message with an id counts as sent.
    if (error || !data?.id) {
      throw new InternalServerErrorException(
        'Unable to send the review email',
      );
    }
  }

  // Fail closed in production: without a verified-domain sender, review links
  // would silently never reach real applicants.
  private resolveSender(): string {
    const configured =
      this.configService.get<string>('email.from')?.trim();

    if (configured) {
      if (!SENDER_PATTERN.test(configured)) {
        throw new InternalServerErrorException(
          'EMAIL_FROM must be an address or "Name <address>"',
        );
      }
      return configured;
    }

    if (this.configService.get<string>('email.nodeEnv') === 'production') {
      throw new InternalServerErrorException(
        'EMAIL_FROM must be set in production (a sender on a domain verified in Resend)',
      );
    }

    this.logger.warn(
      'EMAIL_FROM is not set: using the Resend test sender, which only delivers to the Resend account owner',
    );
    return RESEND_TEST_SENDER;
  }

  private resolveRecipientOverride(): string | null {
    const configured =
      this.configService.get<string>(
        'email.applicationReviewEmailOverride',
      )?.trim();

    if (!configured) {
      return null;
    }

    // Fail closed: the override is honored only in an explicit development or
    // test environment, never when NODE_ENV is production, unset, or anything else.
    const nodeEnv =
      this.configService.get<string>('email.nodeEnv');

    if (nodeEnv === 'production') {
      throw new InternalServerErrorException(
        'APPLICATION_REVIEW_EMAIL_OVERRIDE must not be set in production',
      );
    }

    if (nodeEnv !== 'development' && nodeEnv !== 'test') {
      throw new InternalServerErrorException(
        'APPLICATION_REVIEW_EMAIL_OVERRIDE requires NODE_ENV=development or NODE_ENV=test',
      );
    }

    const override =
      normalizeReviewEmail(configured);

    if (!override) {
      throw new InternalServerErrorException(
        'APPLICATION_REVIEW_EMAIL_OVERRIDE is not a valid email address',
      );
    }

    this.logger.warn(
      'Development mode: all application review emails are redirected to the configured override inbox',
    );

    return override;
  }
}

// Resend's shared test sender: delivers only to the Resend account owner.
export const RESEND_TEST_SENDER = 'Internship Portal <onboarding@resend.dev>';

// "Name <address>" or a bare address, on a single line.
const SENDER_PATTERN = /^(?:[^<>\r\n]{1,100} <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
