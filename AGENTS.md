# AGENTS.md

## Project Overview

This repository is an **Internship Recruitment Portal** built as a full-stack application.

The project follows a **vertical-slice workflow**: each feature should be implemented end-to-end across frontend, backend, and database before moving to the next feature.

Do not use mock data in production-facing pages. Use real backend/database data and proper empty states.

---

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- shadcn/ui
- lucide-react
- Supabase Auth

Default frontend URL:

```text
http://localhost:5173
```

### Backend
- NestJS
- TypeScript
- Node.js 22+
- ESM / NodeNext
- Supabase server client

Default backend URL:

```text
http://localhost:3000
```

### Database / Services
- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Resend for application/review emails
- OpenRouter for CV parsing

---

## Important Coding Conventions

### Backend imports

The backend uses ESM / NodeNext.

Relative imports must include `.js`.

Correct:

```ts
import { AppModule } from './app.module.js';
```

Incorrect:

```ts
import { AppModule } from './app.module';
```

Do not change the backend module system unless explicitly requested.

---

## Frontend Rules

### Components

Prefer existing shadcn/ui components.

Current frequently used components include:

```text
Button
Badge
Card
Input
Label
```

Important:

The project's `Button` component does not support `asChild`.

Do not write:

```tsx
<Button asChild>
  <Link to="/somewhere">Open</Link>
</Button>
```

Instead:

```tsx
<Link to="/somewhere">
  <Button>Open</Button>
</Link>
```

---

## Environment Variables

### Frontend

Expected variables:

```env
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

`VITE_SUPABASE_ANON_KEY` may contain Supabase's modern **Publishable key**.

Never place a Supabase secret/service-role key in the frontend.

### Backend

Backend environment contains private configuration such as:

```env
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
OPENROUTER_API_KEY=...
RESEND_API_KEY=...
```

Never print, expose, commit, or request private keys unnecessarily.

---

## Core Database Tables

### `profiles`

Global user-role table.

Important fields:

```text
id
full_name
email
role
created_at
updated_at
```

`profiles.id` references:

```text
auth.users.id
```

Allowed roles:

```text
APPLICANT
INTERN
MENTOR
HR
ADMIN
```

---

### `applicants`

Applicant-specific profile data.

Important fields:

```text
id
auth_user_id
full_name
email
phone
location
cv_url
profile_data
created_at
```

`auth_user_id` connects the applicant to Supabase Auth.

---

### `applications`

Important fields:

```text
id
applicant_id
internship_id
requested_training
status
cv_path
extracted_data
review_token
review_token_hash
review_token_expires_at
review_token_used_at
applied_at
submitted_at
created_at
```

Possible statuses:

```text
DRAFT
NEW
UNDER_REVIEW
SHORTLISTED
INTERVIEW
SELECTED
REJECTED
```

Draft applications must not appear in the normal HR application list.

---

### `internships`

Important fields:

```text
id
title
is_active
created_at
```

---

### `internship_requirements`

Important fields:

```text
id
internship_id
required_skills
preferred_skills
minimum_education
minimum_experience_years
languages
certifications
other_requirements
created_at
updated_at
```

---

## Storage

Private Supabase Storage bucket:

```text
cvs
```

CV restrictions:

```text
Maximum size: 5 MB
Allowed types: PDF / DOCX
```

Use signed URLs for private HR CV access.

---

## Applicant Application Flow

Current intended flow:

```text
Applicant opens Apply page
        ↓
Selects internship OR chooses Other
        ↓
Uploads CV
        ↓
Backend creates DRAFT application
        ↓
CV is parsed
        ↓
Applicant Auth account is created or linked
        ↓
profiles row is created with role APPLICANT
        ↓
applicants row is created or updated
        ↓
Review email is sent
        ↓
Applicant opens application review
        ↓
Applicant reviews/corrects extracted information
        ↓
Applicant submits final application
        ↓
Application becomes NEW
```

Applicant-facing UI must not mention AI.

Prefer wording such as:

```text
Our system extracts relevant information from your CV.
```

Avoid:

```text
AI processing
AI parser
AI generated profile
```

---

## Other Training Option

Applications can either reference an existing internship or contain a custom requested training area.

The database constraint allows:

```text
internship_id != null
OR
requested_training contains a non-empty value
```

When displaying the application training target, prefer:

```ts
internship?.title ?? requestedTraining
```

Do not assume `internship_id` always exists.

---

## Authentication Architecture

Supabase Auth is used for authentication.

The frontend has:

```text
frontend/src/features/auth/AuthProvider.tsx
```

The auth context exposes values similar to:

```ts
user
session
role
fullName
loading
signOut
```

The user's role must come from the `profiles` table.

Do not trust role values from frontend input.

---

## Frontend Route Protection

The project has:

```text
frontend/src/features/auth/RoleGuard.tsx
```

Expected protection:

```text
/hr/*                 → HR only
/admin/*               → ADMIN only
/applicant/profile    → APPLICANT only
```

Frontend guards are only UX protection.

They are not sufficient security.

Backend authorization must also protect sensitive endpoints.

---

## Backend Authentication / Authorization

The intended backend security layer contains:

```text
backend/src/infrastructure/auth/user-role.type.ts
backend/src/infrastructure/auth/roles.decorator.ts
backend/src/infrastructure/auth/supabase-auth.guard.ts
backend/src/infrastructure/auth/roles.guard.ts
backend/src/infrastructure/auth/auth.module.ts
```

Authentication flow:

```text
Authorization: Bearer <Supabase access token>
        ↓
Supabase auth.getUser(token)
        ↓
Load profiles.role
        ↓
Attach authenticated user to request
        ↓
RolesGuard checks allowed roles
```

Example:

```ts
@UseGuards(
  SupabaseAuthGuard,
  RolesGuard,
)
@Roles('HR')
@Controller('hr/dashboard')
export class HrDashboardController {}
```

All sensitive HR endpoints should eventually require an authenticated HR user.

---

## Authenticated Frontend API Requests

Use the shared helper:

```text
frontend/src/lib/api-client.ts
```

Preferred usage:

```ts
const response = await authenticatedFetch(
  `${env.apiUrl}/hr/dashboard`,
  {
    method: 'GET',
  },
);
```

The helper should obtain the current Supabase session and attach:

```http
Authorization: Bearer <access_token>
```

Do not manually duplicate session/token logic across every service unless necessary.

---

## Unified Login

The desired architecture is one login page for all roles:

```text
/login
```

After authentication, redirect using `profiles.role`:

```text
ADMIN       → /admin/dashboard
HR          → /hr/dashboard
APPLICANT   → /applicant/profile
INTERN      → /intern
MENTOR      → /mentor
```

Do not create separate permanent login systems for each role unless explicitly requested.

---

## Main Frontend Routes

Public:

```text
/
/internships
/apply
/application-review/:reviewToken
/login
```

Applicant:

```text
/applicant/profile
```

HR:

```text
/hr/dashboard
/hr/applications
/hr/applications/:id
/hr/internships
```

The Mentor route/workspace has been added in recent implementation work; verify the current route tree and end-to-end behavior before changing its status. The Intern portal status must also be verified from the actual repository. Do not assume either role portal is complete merely because a route exists.

Do not create fake portal pages just to make navigation look complete.

---

## Dynamic Navigation

Navbar content should depend on authentication and role.

### Guest

Typical navigation:

```text
Home
Internships
Apply
Sign In
```

### Applicant

```text
Home
Internships
My Profile
Sign Out
```

### HR

```text
Home
Dashboard
Applications
Internships
Sign Out
```

### Admin

```text
Home
Admin Dashboard
User Management
Roles & Permissions
System Settings
Sign Out
```

Intern and Mentor navigation should be added when their real pages exist.

---

## Home Page CTA Behavior

The main Home page should not show a hardcoded `Create Account` button.

Expected behavior:

```text
Guest      → Sign In
Applicant  → My Profile
HR         → HR Dashboard
Admin      → Admin Dashboard
Intern     → Intern Portal when implemented
Mentor     → Mentor Portal when implemented
```

---

## Admin Portal

The Admin role is responsible for system-level administration and must be kept separate from HR responsibilities.

Admin may manage:

```text
User Management
Roles & Permissions
System Settings
System-level configuration
```

Admin should not automatically perform HR recruitment decisions simply because it has broader system permissions. HR remains responsible for internship recruitment workflows.

All Admin endpoints must require an authenticated user with `ADMIN` role.

---

## HR Portal

Current HR functionality includes:

```text
Dashboard
Applications list
Application details
Internships management
Internship requirements
Training Demand
CV access
Application status updates
```

The dashboard must use real Supabase data.

Do not introduce fake counts or sample applications.

---

## Applicant Portal

Applicant profile currently contains information such as:

```text
Personal Information
Summary
Skills
Education
Applications
Application statuses
```

The applicant should only access their own data.

---

## CV Parsing

Current CV parsing uses OpenRouter.

The free model has previously produced unreliable email extraction.

Do not silently add regex-based extraction unless explicitly requested.

The user intends to switch to a stronger paid model later.

Keep model-specific code isolated so the model can be changed without rewriting the application flow.

---

## Employment Decision Safety

This is an internship/employment system.

Do not implement automatic hiring decisions based on AI scores.

Do not automatically:

```text
select candidates
reject candidates
rank candidates for hiring
schedule interviews based on AI score
apply score thresholds that determine employment outcome
```

AI can assist with administrative tasks and objective requirement comparison, but final employment decisions must remain human-reviewed.

Avoid using protected or sensitive personal characteristics in candidate evaluation.

---

## Review Link Security

The intended review-link design uses:

```text
review_token_hash
review_token_expires_at
review_token_used_at
```

Recommended behavior:

```text
Generate cryptographically random token
        ↓
Send raw token only in email
        ↓
Store SHA-256 hash in database
        ↓
Expire token after limited period
        ↓
Allow one successful final submission
        ↓
Mark review_token_used_at
```

Legacy `review_token` may still exist for old applications.

Do not remove legacy data until migrations are confirmed safe.

---

## Duplicate CV Protection

This is planned but not yet confirmed as implemented.

Intended design:

```text
SHA-256(file.buffer)
        ↓
applications.cv_sha256
        ↓
unique partial index
```

Use both:

- pre-check for friendly error messages
- database unique constraint/index for race-condition safety

---

## Current Development Priorities

Recommended order:

1. Finish unified `/login`
2. Define and support the `ADMIN` role in the authentication and authorization architecture
3. Create a real HR Supabase Auth user with `profiles.role = 'HR'`
4. Create a real Admin Supabase Auth user with `profiles.role = 'ADMIN'` when Admin functionality is implemented
5. Convert all HR frontend services to `authenticatedFetch`
6. Enable backend `SupabaseAuthGuard`
7. Enable backend `RolesGuard`
8. Protect all HR endpoints
9. Protect applicant endpoints where appropriate
10. Build Intern portal
11. Build Mentor portal
12. Finish duplicate CV protection
13. Verify secure one-time review links end-to-end
14. Upgrade CV parsing model later

---

## Testing Rules

Whenever a feature is changed, test it through the real frontend flow when possible.

Avoid relying on Postman when the same flow can be validated directly from the UI.

### Minimum role tests

Applicant:

```text
/applicant/profile     → allowed
/hr/dashboard          → blocked
```

HR:

```text
/hr/dashboard          → allowed
/applicant/profile     → blocked unless explicitly supported
/admin/dashboard       → blocked
```

Admin:

```text
/admin/dashboard       → allowed
/hr/dashboard          → blocked unless explicitly supported
/applicant/profile     → blocked unless explicitly supported
```

Guest:

```text
/hr/dashboard          → redirected to login
/applicant/profile     → redirected to login
```

### Browser Network verification

For protected API calls, check:

```text
DevTools
→ Network
→ Request
→ Headers
```

Expected:

```http
Authorization: Bearer eyJ...
```

---

## Backend CORS

Current backend allows the frontend origin:

```ts
app.enableCors({
  origin: 'http://localhost:5173',
});
```

Keep this during local development.

Production origins should be configured separately later.

---

## Backend Validation

Global validation is enabled:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
);
```

DTOs should therefore be used for incoming request bodies.

Do not bypass DTO validation without a good reason.

---

## Database Access Rules

Backend uses the Supabase secret/service-role client.

Frontend uses Supabase publishable/anon credentials only.

Never expose backend service-role credentials to the browser.

RLS should remain enabled for frontend-accessible tables.

For `profiles`, authenticated users should only read their own row unless a specific secure use case requires otherwise.

---

## Working Style for Agents

When modifying this project:

1. State the exact file path before giving code.
2. Prefer full files when a file is substantially changed.
3. Keep changes consistent with the existing architecture.
4. Do not add mock data.
5. Do not create temporary production-facing shortcuts.
6. Do not replace Supabase with Prisma.
7. Do not change ports unless explicitly requested.
8. Do not change the ESM/NodeNext setup.
9. Do not expose secrets.
10. Preserve existing working flows while adding new features.
11. Implement one vertical slice at a time.
12. Verify frontend + backend + database integration before moving on.

---

## Current Known Local Ports

```text
Frontend: http://localhost:5173
Backend:  http://localhost:3000
```

---

## Important Existing User Example

A known applicant account used during development:

```text
Example Applicant (fictional placeholder)
Role: APPLICANT
```

Do not hardcode this user or any other user in application logic.

Use real authenticated user/session/profile data.

---

## Final Principle

Treat authentication, authorization, database integrity, and role separation as backend responsibilities.

Frontend checks improve UX, but backend guards and database policies are the actual security boundary.

---

## Authoritative Business Workflow and Role Responsibilities

This section is the current source of truth for business workflow. If an older section above conflicts with this section, follow this section and verify the actual repository before changing implementation.

### Applicant workflow

The intended flow is:

1. Applicant selects or requests an internship training type.
2. Applicant uploads a CV.
3. The backend creates or maintains a draft application and processes the CV through the existing configured extraction flow.
4. Extracted information populates the application review form.
5. Applicant reviews and corrects extracted information.
6. Applicant explicitly submits the reviewed application.
7. The application enters the appropriate submitted status and becomes available to HR.

Never silently submit extracted data on the applicant's behalf. Do not claim AI extraction is complete without tracing the actual frontend, backend, provider integration, storage, and error handling.

Applicants may request either an existing internship or a custom training area where supported by the existing schema. Do not assume every application has a non-null `internship_id`; the existing `requested_training` option must be preserved.

### HR: application review and training-type decisions

HR owns recruitment decisions and internship planning. HR reviews applications, evaluates eligibility against actual organizational requirements, manages application statuses, selects applicants, creates placements for selected applicants, and assigns or reassigns existing Mentors to placements.

HR also decides which training types should be offered. The system should support HR in reviewing:

- The training type requested by each applicant.
- The number of applicants requesting each type.
- The available applicant information relevant to eligibility.
- Any actual organizational requirements or capacity information that the project explicitly defines.

Keep these three concepts distinct:

- `Requested Training Type`: what an applicant requests (currently associated with `applications.requested_training` and/or `applications.internship_id`, depending on the application).
- `HR Training Decision`: HR's decision about which training types the organization will offer.
- `Internship Placement`: the actual placement created for a selected applicant.

HR retains final decision-making authority. The system may show counts and eligibility information, but must not automatically decide to offer or cancel a training type unless that rule is explicitly approved. Do not invent minimum applicant counts, eligibility formulas, training capacity, or automatic approval thresholds. If the current schema/UI cannot record or support HR's decision, document the gap and propose the smallest suitable change; do not silently invent a data model or implement it without approval.

Do not confuse the existing HR `Training Demand` page or applicant-request counts with a complete training-type decision workflow. Verify what the page actually displays, what data backs it, and whether HR can record a decision.

### Placement-based HR, Mentor, and Intern relationship

The intended relationship is:

`HR manages a placement and assigns a Mentor → the Mentor supervises the Intern through that placement → the Intern works on their own tasks.`

- HR is responsible for creating/managing placements and assigning or reassigning an existing Mentor.
- A Mentor can access only placements assigned to that Mentor and interns/tasks within those placements.
- A Mentor may create tasks only for an `ACTIVE` placement assigned to that Mentor.
- An Intern can access and update only their own authorized task data and cannot manage Mentor assignments or perform HR-only actions.
- Backend authorization and database permissions must enforce role, ownership, assignment, and placement-status rules. Frontend route guards alone are not security controls.
- The Mentor relationship is placement-based through `intern_placements.mentor_profile_id` where present. Do not replace it with an unrelated global user-to-Mentor relationship.
- HR alone manages placement-to-Mentor assignment/reassignment. Mentors must not assign themselves or access another Mentor's placements.
- Verify reassignment behavior so a previously assigned Mentor loses access that depends on the old assignment.

Do not add skill matching, capacity balancing, automatic Mentor assignment, or other unrequested rules.

### Mentor account management versus HR assignment

Mentor account provisioning is separate from assigning a Mentor to a placement:

- An authorized `ADMIN` should be responsible for creating or inviting Mentor accounts, if this capability is implemented and ADMIN access is genuinely provisioned and secured.
- HR chooses an existing Mentor when creating or updating a placement.
- ADMIN and HR are separate roles. Do not grant HR administrative account-management access just because HR assigns Mentors to placements.
- Do not assume ADMIN is usable merely because it appears in a role union, enum, or route. Verify real authentication, profile provisioning, guards, API endpoints, and database authorization.
- Do not expose public role selection or allow users to promote themselves to `MENTOR` or `ADMIN`.
- Do not create an administrator, invite an account, or change any role without explicit approval.

If Mentor account creation/invitation is missing, propose a secure flow compatible with the current Supabase Auth/profile architecture. Account provisioning must safely handle duplicate email addresses, Auth-user/profile consistency, invitation/activation failures, and partial failures. Keep service-role credentials on the backend only.

### Application-to-Intern transition

A selected applicant and an Intern are related but distinct lifecycle states. Preserve the existing application status workflow and verify how placement activation transitions an applicant to the `INTERN` role. Do not assume that setting an application status to `SELECTED` alone creates an Intern profile or placement. Confirm the actual transactional behavior and authorization.

---

## Current Database and Implementation Notes (Verify Before Acting)

The following migration files have been reported as applied to the linked Supabase project. Inspect local migration files and remote state before making any database decision; do not recreate or blindly reapply them:

- `20261009000000_create_intern_placements.sql`
- `20261009010000_intern_placement_rpcs.sql`
- `20261009020000_submit_application_review_safely.sql`
- `20261009030000_create_intern_tasks.sql`
- `20261009040000_mentor_assignment_and_task_authorization.sql`

The latest migration was reported to add `mentor_profile_id` to `intern_placements` and support Mentor assignment/task authorization. Treat that as historical context, not proof of present correctness. Verify the actual migration, RPCs, grants, backend adapters, frontend services, and tests.

Earlier read-only checks reported profile counts of APPLICANT: 6, HR: 1, INTERN: 1, MENTOR: 0. These counts are time-sensitive and must not be treated as current without a new read-only check. If there are no Mentor profiles, an empty Mentor selector may be expected rather than a UI bug. Do not create a Mentor account or change roles just to populate the selector.

Earlier testing was reported as 17 backend test files / 99 tests passing, backend build and lint passing (with empty-file warnings), frontend build passing, and 11 unrelated pre-existing full-frontend-lint errors. These are historical results. Report them as current only after rerunning the relevant checks and recording the real output. Do not claim integration or live end-to-end verification unless it actually occurred.

Earlier investigation found that applicant provisioning is handled separately from the mostly empty authentication controller/use-case/repository flow; the applicant provisioning service creates or links a Supabase Auth user and a `profiles` row with `APPLICANT`. A placement activation RPC was reported to perform the `APPLICANT` → `INTERN` transition. Reinspect the current code before relying on these findings.

Do not assume the complete live `profiles` schema, role constraints, RLS policies, or Auth triggers from migration files alone. Inspect authoritative definitions where possible and report unknowns explicitly.

---

## Current Audit and Implementation Workflow

For broad or cross-cutting work, begin with an evidence-based audit before implementation. Classify each area as:

- Implemented and verified
- Implemented but insufficiently tested
- Partially implemented
- Not implemented
- Requires live verification
- Blocked by a missing business decision

The audit must cover authentication/account lifecycle, role authorization, CV upload and extraction, application submission/review, training-type demand and HR decisions, placement lifecycle, Mentor account management, Mentor assignment, task authorization, Supabase schema/RLS/RPC privileges, frontend routes, tests, and deployment configuration.

Prioritize findings as:

- **P0:** confirmed security, authorization, or data-integrity blockers.
- **P1:** missing essential business workflows and lifecycle functionality.
- **P2:** validation, tests, usability, observability, and maintainability.
- **P3:** optional enhancements that do not block core workflows.

Each task must identify evidence, impact, dependencies, affected files/database objects, whether a migration is needed, and acceptance criteria. Do not invent findings or test results. Distinguish local checks from live Supabase checks.

For investigation-only requests, perform read-only inspection and safe non-mutating verification only. Do not edit files, run mutating SQL, apply migrations, create/invite users, change roles, install dependencies, alter environment files, or change remote state until the user explicitly approves the specific action. If a verification command may have side effects, explain it and request approval first.

When implementation is approved, preserve existing working flows and deliver one vertical slice at a time across frontend, backend, and database. Avoid broad refactors and unrelated changes. Verify each slice before moving to the next.

---

## Updated Priority Guidance

The older numbered priority list in this file is historical and must not be followed blindly. Determine actual current status before choosing the next task. In particular:

1. Verify authentication and server-side role/ownership enforcement for all existing workflows.
2. Verify the full applicant application/review flow and its secure one-time review-link behavior.
3. Verify HR's training-demand information and determine whether HR can actually record decisions about training types to offer.
4. Verify placement creation/activation, the `APPLICANT` → `INTERN` transition, and Mentor assignment/reassignment.
5. Verify Mentor task authorization and Intern ownership restrictions.
6. Determine whether a real, authorized ADMIN account-management workflow exists; if not, plan secure Mentor account invitation/creation separately from HR placement assignment.
7. Verify CV upload/extraction reliability, duplicate-CV protections, and relevant error paths.
8. Address quality and optional improvements only after critical security and core business workflows are verified.

This list is guidance for audit prioritization, not permission to implement these tasks without approval.
