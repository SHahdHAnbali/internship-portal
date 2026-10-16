# Internship Portal

A full-stack internship recruitment and management portal. Applicants apply with a CV,
HR reviews applications and plans training opportunities and placements, Mentors
supervise interns through their placements, and administrators manage staff accounts
and portal settings.

## Features

- **Applicants:** browse listed internships or request another training area, upload a
  CV (PDF or DOCX, up to 5 MB), then review and correct the information extracted from
  it through a one-time emailed link before submitting. The applicant account is created
  only when the reviewed application is submitted. Applicants can then sign in to follow
  their applications and edit their profile.
- **HR:** application list (search, filters, CSV export), application details with
  private CV access, status decisions with history, an advisory comparison against an
  internship's requirements (HR makes every decision), training planning (approval,
  capacity, selection release), placements (create, activate, cancel, complete),
  Mentor assignment and an intern progress overview.
- **Mentors:** tasks for interns on their assigned placements (create, edit, cancel,
  review) and weekly report reviews.
- **Interns:** dashboard, tasks (start, complete, withdraw a submission before the due
  date), weekly reports and a read-only profile.
- **Admins:** staff account creation, role changes, deactivation, an audit trail, and
  an application intake switch that opens or closes new applications.

Sign-in uses a one-time email link. Roles come from the `profiles` table and are
enforced by the backend and by the database functions.

## Architecture

| Part | Location | Stack |
|---|---|---|
| Frontend | `frontend/` | React, TypeScript, Vite, shadcn/ui, TanStack Query, Supabase Auth |
| Backend | `backend/` | NestJS (ESM), TypeScript; Supabase server client, Resend, OpenRouter |
| Database | `supabase/` | Supabase Postgres, Auth and Storage; SQL migrations and database tests |

The backend uses the Supabase secret key and calls database functions that are granted
only to the service role; the browser uses only the publishable key. Application-review
emails are sent by the backend through Resend; sign-in emails are sent by Supabase Auth.

## Prerequisites

- Node.js 22 or later (see `.nvmrc`; the backend does not start on Node 20)
- npm
- A Supabase project, a Resend account and an OpenRouter API key
- Optional, for the database tests: local PostgreSQL binaries (`initdb`, `pg_ctl`, `psql`)

## Setup

Run these from the repository root:

```bash
nvm use                           # Node 22
(cd backend  && npm install)
(cd frontend && npm install)
```

The frontend test dependencies were installed with `--legacy-peer-deps` because npm
10.8 failed to resolve Vitest's optional peer dependencies; use that flag if
`npm install` reports a peer-dependency error.

### Environment variables

Copy the examples and fill in your own values. Never commit `.env` files (they are
ignored by `.gitignore`).

```bash
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

- `backend/.env`: Supabase URL and secret key, OpenRouter key, Resend key,
  `EMAIL_FROM`, `FRONTEND_URL`, `NODE_ENV`, and the development-only
  `APPLICATION_REVIEW_EMAIL_OVERRIDE`. See the comments in `backend/.env.example`.
- `frontend/.env`: `VITE_API_URL`, `VITE_SUPABASE_URL` and the publishable
  `VITE_SUPABASE_ANON_KEY`. Every `VITE_*` value is bundled into the browser build.

## Running in development

Both development servers keep running in the terminal that starts them, so start each one
in its own terminal window or tab, from the repository root, and stop it with Ctrl+C:

```bash
# Terminal 1: backend (http://localhost:3000)
cd backend && npm run start:dev
```

```bash
# Terminal 2: frontend (http://localhost:5173)
cd frontend && npm run dev
```

The backend allows CORS from `http://localhost:5173` and listens on port 3000; both are
currently hard-coded in `backend/src/main.ts`.

The first administrator is created once with
`(cd backend && npm run admin:bootstrap -- --email <email>)` for an account that already
exists in Supabase Auth with a confirmed email (see `backend/scripts/bootstrap-admin.mjs`).
Later staff accounts are created from the Admin portal.

## Database

- `supabase/migrations/` contains the schema changes, database functions and grants,
  applied in timestamp order (for example with `supabase db push` against a linked project).
- The migrations do **not** create the original base tables (`profiles`, `applicants`,
  `applications`, `internships`, `internship_requirements`, `application_matches`) or the
  private `cvs` storage bucket; these predate the migration history. A reproduction of
  that base schema exists only as a test fixture (`supabase/tests/fixtures/base_schema.sql`),
  so a new Supabase project cannot yet be created from the migrations alone.
- This limitation concerns provisioning a completely fresh Supabase project. It is not, by
  itself, a sign of a problem in an existing project whose base tables and bucket were set up
  before the migration history; such a project receives new migrations incrementally, and
  this limitation is not a reason to create a new Supabase project.
- `supabase/config.toml` configures the local Supabase CLI stack only; it does not reflect
  the settings of a remote project.

## Tests and checks

Run these from the repository root; each line runs in its own subshell, so the lines can be
run one by one or pasted together:

```bash
(cd backend  && npm test)           # unit and HTTP authorization tests (Vitest)
(cd backend  && npm run lint)       # oxlint
(cd backend  && npm run test:db)    # SQL tests on a throwaway local PostgreSQL cluster
(cd frontend && npm test)           # component and unit tests (Vitest)
(cd frontend && npm run lint)       # ESLint
(cd frontend && npm run build)      # type check and production build
```

`npm run test:db` (`supabase/tests/run.sh`) creates a temporary local PostgreSQL cluster,
loads the base schema fixture and every migration, runs `supabase/tests/sql/*.test.sql`,
and never connects to a linked Supabase project. Set `PG_BIN` if the PostgreSQL binaries
are not on your `PATH`.

## Configuration notes

- Public sign-up should stay disabled in Supabase Auth: the portal creates applicant
  accounts on the server after review submission, staff accounts through the Admin
  portal, and the login page never creates accounts.
- Add the frontend's `/login` URL (for local development, `http://localhost:5173/login`)
  to the Supabase Auth redirect URLs.
- In production, `EMAIL_FROM` must be a sender on a domain verified in Resend, and
  `APPLICATION_REVIEW_EMAIL_OVERRIDE` must not be set; the backend refuses to start
  otherwise. Set `FRONTEND_URL` and `VITE_API_URL` explicitly, since both fall back to
  localhost addresses.
- Sign-in emails come from Supabase Auth. Supabase's built-in email service has strict
  sending limits; configure custom SMTP in Supabase Auth before real use.

## Known limitations

- **CV email extraction.** The application-review link is emailed to the address extracted
  from the CV. CV text is parsed through OpenRouter with the model `openrouter/free`
  (hard-coded in `backend/src/modules/applications/infrastructure/ai/ai-cv-parser.service.ts`);
  the whole review flow therefore depends on that extraction finding the applicant's address.
  If no valid address is found, `POST /applications/submit` is refused with HTTP 422 ("We
  could not find a valid email address in your CV. Please add your email address to your CV
  and try again.") before the CV is uploaded, a draft application is created or a review
  email is sent.
  The address is only checked for a valid format, so a well-formed but wrong extraction
  would send the review link to that address.
- **Fresh installations** need the base tables and the `cvs` bucket created outside the
  migrations (see [Database](#database)).

## Project documentation

- `AGENTS.md`: conventions and business rules for contributors and coding agents.
- `docs/IMPLEMENTATION_CHECKLIST.md`: implementation and verification log.

## License

No license file is included. Unless a license is added, all rights are reserved by the
author.
