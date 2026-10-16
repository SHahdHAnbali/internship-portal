// One-time setup: make an existing, email-confirmed sign-in account the first
// ADMIN. Run it yourself from backend/ (it uses the secret key from .env):
//
//   npm run admin:bootstrap -- --email owner@example.com [--name "Full Name"] [--confirm-role-change]
//
// * The account must already exist in Supabase Auth with a confirmed email
//   (Dashboard → Authentication → Users → Add user, "Auto Confirm User").
// * An account without a profile becomes ADMIN directly. An existing HR or
//   Mentor profile is converted only with --confirm-role-change (it then loses
//   that role: ADMIN does not include HR or Mentor permissions). Applicant and
//   Intern accounts are refused.
// * The database refuses the bootstrap once any ADMIN exists; later admins
//   are created from the Admin portal. Nothing secret is printed.
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

const MESSAGES = {
  admin_already_exists: 'An administrator already exists. Create further administrators from the Admin portal.',
  profile_role_not_promotable: 'This account is an applicant or intern account and cannot become an administrator. Use a separate account.',
  role_change_confirmation_required: 'This account already has an HR or Mentor profile. Re-run with --confirm-role-change to convert it (it will lose that role).',
  mentor_has_open_placements: 'This Mentor still supervises scheduled or active placements. HR must reassign them first.',
  account_already_exists: 'Another profile already uses this email address.',
  auth_user_not_found: 'The sign-in account no longer exists.',
  invalid_email: 'The account has no valid email address.',
  full_name_required: 'The name is too long (200 characters at most).',
};

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    'confirm-role-change': { type: 'boolean', default: false },
  },
  strict: true,
});

const email = values.email?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  fail('Pass the account email: npm run admin:bootstrap -- --email owner@example.com');
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  fail('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in backend/.env.');
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) fail('Unable to read sign-in accounts from Supabase Auth.');
    const match = data.users.find((user) => user.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

const user = await findUserByEmail(email);
if (!user) {
  fail('No sign-in account uses this email. Create it first: Supabase Dashboard → Authentication → Users → Add user (Auto Confirm User).');
}
if (!user.email_confirmed_at) {
  fail('This account has not confirmed its email address yet.');
}
if (user.banned_until && new Date(user.banned_until) > new Date()) {
  fail('This account is blocked from signing in.');
}

const fullName = values.name?.trim() || user.user_metadata?.full_name || null;
const { data, error } = await supabase.rpc('bootstrap_first_admin', {
  p_user_id: user.id,
  p_email: user.email,
  p_full_name: fullName,
  p_allow_role_change: values['confirm-role-change'],
});

if (error) {
  fail(MESSAGES[error.message] ?? 'The database refused the bootstrap.');
}

const profile = Array.isArray(data) ? data[0] : null;
if (!profile || profile.role !== 'ADMIN') {
  fail('Unexpected result: the account was not promoted.');
}

console.log(`✓ ${profile.email} is now the first administrator. Sign in at /login with this email.`);
