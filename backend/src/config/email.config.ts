import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  resendApiKey: process.env.RESEND_API_KEY,
  frontendUrl:
    process.env.FRONTEND_URL ??
    'http://localhost:5173',
  // Development only: when set, every application review email is delivered
  // to this inbox instead of the applicant's address.
  applicationReviewEmailOverride:
    process.env.APPLICATION_REVIEW_EMAIL_OVERRIDE,
  // Sender, e.g. "Internship Portal <no-reply@your-verified-domain>". Required
  // in production: Resend's test sender only delivers to the account owner.
  from: process.env.EMAIL_FROM,
  nodeEnv: process.env.NODE_ENV,
}));
