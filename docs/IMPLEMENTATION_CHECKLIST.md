# Implementation Checklist

Living checkpoint for the feature-completion work (started 2026-10-11).
Execution order and rules: see `AGENTS.md`. One feature at a time; a feature
is complete only when database, backend, frontend and tests are done and verified.

## How to verify

```bash
cd backend  && npx tsc -p tsconfig.json --noEmit --incremental false && npx vitest run && npx oxlint --type-aware src/ test/
cd backend  && npm run test:db          # throwaway local PostgreSQL: base schema + all migrations + SQL tests
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx eslint . && npm run build
```

`supabase/tests/run.sh` never touches the linked project. It needs local
PostgreSQL binaries (`PG_BIN` if not on PATH).

## Migrations

| Migration | Purpose | Remote |
|---|---|---|
| 20261009000000 … 20261009040000 | Placements, RPCs, review submission, tasks, Mentor assignment | Applied (pre-existing) |
| 20261010000000_defer_applicant_provisioning_to_review | Account created only after review; immutable review email | Applied + verified 2026-10-10 |
| 20261011000000_application_data_and_status_history | Original AI extraction kept; duplicate CV/training protection; rejection reason; append-only status history; `update_application_status_v2`; applicant profile edit RPC | Applied + verified 2026-10-11 |
| 20261011010000_training_planning | Opportunity capacity; "Other" request → opportunity mapping; append-only planning history; capacity-enforced selection; applications→internships FK RESTRICT | Applied + verified 2026-10-11 |
| 20261011020000_placement_lifecycle | Placement → opportunity link (backfilled, NOT NULL, RESTRICT); cancellation (reason, timestamp); one open placement per application; append-only placement events; seat check on activation; `cancel_intern_placement` | Applied + verified 2026-10-11 |
| 20261011030000_admin_user_management | ADMIN role; `profiles.is_active`/`deactivated_at`; browser TRUNCATE/TRIGGER/REFERENCES on profiles revoked; append-only `admin_audit_events`; staff creation, role change, (de)activation with own-account, last-admin and Mentor-placement protection; one-time `bootstrap_first_admin` | Applied + verified 2026-10-11 |
| 20261011040000_mentor_assignment_history | Mentor assignment only on open placements, only active Mentors, no-op refused; `unassign_intern_placement_mentor`; assignment history in `intern_placement_events`; `list_hr_mentors` returns active Mentors with open-placement counts | Applied + verified 2026-10-11 |
| 20261011050000_mentor_task_management | Task priority, creator, cancellation, Mentor review (accept / request changes + feedback); append-only `intern_task_events`; Mentor edit/cancel/review RPCs; intern status update with progress note (4-arg, old 3-arg dropped); `create_mentor_intern_task` with priority (old 5-arg dropped); Mentor placement list with task counts; Mentor task history | Applied + verified 2026-10-11 |
| 20261011060000_intern_weekly_reports | `intern_weekly_reports` (one per placement/week, Monday weeks, DRAFT/SUBMITTED/ACCEPTED/RETURNED), append-only report events, intern save/submit/list and Mentor list/review RPCs, Mentor placement list + `reports_awaiting_review` | Applied + verified 2026-10-11 |
| 20261011070000_hr_intern_progress | `list_hr_intern_progress` (HR only): per placement Mentor, task and weekly-report counts, last activity (no content, drafts excluded) | Applied + verified 2026-10-11 |
| 20261011090000_placement_completion | HR-only `complete_intern_placement` (early end needs a reason; blocked by open/unreviewed tasks and reports awaiting review); completion columns + consistency check; intern task/report lists show the active, else latest completed placement (read-only) | Applied + verified 2026-10-11 |
| 20261013000000_withdraw_task_submission | `withdraw_my_intern_task_submission` + `intern_task_withdrawal_open`; `WITHDRAWN` task event | Applied + verified 2026-10-13 (owner-authorized) |
| 20261011080000_revoke_browser_truncate | Revokes TRUNCATE/TRIGGER/REFERENCES from anon/authenticated on the six pre-history base tables | Applied + verified 2026-10-11 |
| 20261014000000_capacity_selection_and_intake | Opportunity approval (`selection_status`), cumulative seats with explicit final selection release, `portal_settings` application-intake switch (ADMIN), intake enforcement on draft creation and review submission; replaces `create/update_training_opportunity` | Applied + verified 2026-10-14 (owner-authorized; see "Feature 2026-10-14") |
| 20261017000000_mentor_activation_history_and_reassignment | Activation requires an eligible assigned Mentor (`mentor_required`); the assigned, active Mentor reads a COMPLETED placement's tasks, task history and reports (read-only); an ACTIVE placement's Mentor can be replaced but not removed (`active_placement_requires_mentor`) | Applied + verified 2026-10-17 (owner-authorized; see "Feature 2026-10-17") |
| 20261017010000_backfill_applicant_profile_data | One-time, fill-only backfill of `applicants.profile_data` (only where NULL) from the applicant's latest submitted, non-DRAFT application; no schema, function or grant change | Applied + verified 2026-10-17 (owner-authorized; see "Fix 2026-10-17") |
| 20261017020000_profile_password_setup | `profiles.password_set_at` (nullable) and service_role-only `mark_my_password_set(uuid)` for the required first-time password setup | Applied + verified (owner-authorized) |
| 20261018000000_retire_intern_task_workflows | Drops the 13 task-only functions; rebuilds `list_my_mentor_placements` and `list_hr_intern_progress` without task columns (HR last activity from the placement row and weekly-report submissions/reviews only); `complete_intern_placement` no longer checks tasks; `intern_tasks` / `intern_task_events` kept with every row as a read-only archive (service_role SELECT only); keeps `intern_task_clean_text` | Applied + verified 2026-10-18 (owner-authorized; see "Feature 2026-10-18") |

## Features

### 1–2. Applicant application/profile + HR Application Management — COMPLETE (2026-10-11)

- Original AI extraction stored in `applications.original_extracted_data` (immutable,
  trigger-protected). Backfilled only for the 6 drafts that still held it; the 7
  applications submitted earlier had already been overwritten and stay NULL (shown as
  "not retained" to HR). `extracted_data` = reviewed submission once status ≠ DRAFT.
- Duplicate protection: CV SHA-256 (`cv_sha256`) pre-check at upload + unique partial
  index; one application per applicant per training (listed or "Other").
- Upload: 5 MB streaming limit (413), missing-file 400, PII-free logging, HTML-escaped email.
- Review link states: `REVIEW_LINK_NOT_FOUND` (404), `REVIEW_LINK_USED` / `REVIEW_LINK_EXPIRED` (410).
- Reviewed payload fully validated (nested DTOs, bounded sizes, unknown fields stripped).
- Applicant dashboard: history, training, submission date, status message, rejection
  reason (only when rejected); profile edit (descriptive fields only) via
  `update_my_applicant_profile`. No HR notes/history/CV paths exposed.
- HR list: server-side search/status filter/sort (submission date, name, status),
  CSV export of the same rows (approved fields: id, name, email, training, status,
  submitted date; RFC 4180 + formula-injection safe). No pagination (volume small; all rows load).
- HR details: all reviewed fields incl. languages, certifications, safe http(s) links;
  original vs submitted comparison with change summary; on-demand signed CV URL (5 min);
  advisory matching; drafts return 404 on every HR endpoint; no raw DB errors.
- Decisions: forward-only stages (skipping allowed), SELECTED/REJECTED final, rejection
  reason required (applicant-visible), optional internal note, append-only history with
  actor/time; enforced in `update_application_status_v2` (row lock) — old function revoked.
- Session expiry: backend 401 signs the user out; wrong-role routes redirect to the
  user's own portal.

Verification (2026-10-11): backend 28 files / 424 tests; DB harness 72/72; backend tsc +
oxlint clean; frontend tsc + build pass; frontend eslint 1 remaining error
(`useInternships.ts`, fixed in Feature 3). Live read-only smoke checks against the running
backend + linked DB passed (401s, review-link codes, 400 missing file, 413 oversize).

Needs a person to verify live (authenticated flows; not automatable without credentials):
HR status change + rejection reason + history in the browser; CSV download; applicant
profile edit; review link used/expired screens.

### 3. HR Training Demand and Planning — COMPLETE (2026-10-11)

- Training opportunity = `internships` row + `capacity` (NULL = not planned). Created/updated
  only via `create_training_opportunity` / `update_training_opportunity` (HR, audited).
  Capacity can't drop below selected applicants or be cleared while selections exist.
- "Other" requests: `training_request_mappings` (normalized label → opportunity) via
  `map_training_request` / `unmap_training_request`; refused while selections depend on
  the mapping. Applicant requests are never rewritten. Unknown labels refused.
- Selection (`update_application_status_v2`) requires a resolved opportunity
  (`training_not_planned`), a capacity (`training_capacity_not_set`) and a free seat
  (`training_capacity_full`); lock order application → mapping (share) → opportunity.
  Proven with a real two-session test (dblink): no overbooking.
  *Superseded in part 2026-10-14:* selection now also requires `selection_status = 'OPEN'`
  (`training_not_approved`, `training_selection_closed`), and the free-seat check counts
  cumulative seats (see "Feature 2026-10-14").
- `training_plan_events`: append-only planning history (who/what/from→to/note).
- `applications.internship_id` FK changed CASCADE → RESTRICT (training records can't be
  deleted out from under applications). No delete endpoint exists.
- HR UI: `/hr/training-planning` — totals, per-opportunity demand by status, seats bar,
  placements, required-skill coverage, common applicant skills, linked requests (unlink),
  unmatched requests (link / create-from-request), planning history; create/edit dialog
  with inline validation. Dashboard demand card now derives from the same computation.
- Planning figures are informational; no automatic selection or ranking.

Verification (2026-10-11): backend 30 files / 484 tests; DB harness 110/110 (incl.
concurrency); backend tsc + oxlint clean; frontend tsc + eslint (0 problems) + build pass;
live 401 smoke checks for new routes; public `GET /internships` exposes no capacity.

Operational note: the existing internship had no capacity after deployment — HR must set
seats in Training Planning before selecting further applicants (intended rule).

### 4. Selection, Placement creation/activation — COMPLETE (2026-10-11)

- Selection with capacity was delivered in Feature 3 (`update_application_status_v2`).
- `intern_placements.internship_id`: the opportunity a placement counts against, resolved
  with `resolve_application_training` (listed internship or mapped "Other" request).
- `create_intern_placement`: SELECTED application only, end date not passed, no open
  placement (partial unique index `WHERE status <> 'CANCELLED'`), company/department ≤ 200.
- `activate_intern_placement`: SCHEDULED → ACTIVE; APPLICANT → INTERN role change kept;
  refuses when ACTIVE placements already fill the seats (lock order application →
  placement → applicant → profile → opportunity). Proven with a real two-session test.
  *Superseded 2026-10-14:* activation now checks cumulative seats consumed (not ACTIVE
  placements) and refuses a released selection (see "Feature 2026-10-14").
- `cancel_intern_placement`: SCHEDULED only, reason required; the application stays
  SELECTED so a new placement can be scheduled. ACTIVE placements can't be cancelled
  (ending an active internship is a later lifecycle step, not invented here).
- `intern_placement_events`: append-only history (CREATED / ACTIVATED / CANCELLED, actor,
  reason as note). Backend: `GET /hr/applications/:id/placement` returns an overview
  (current, cancelled, training, seats, history); new `POST /hr/placements/:id/cancel`.
- HR UI: seat summary, activation confirmation dialog, cancel dialog with required reason,
  cancelled placements, placement history; past end dates blocked in the form.
- Applicant UI: a selected application shows its scheduled/active placement (company,
  department, dates; no Mentor or internal data). After activation the profile API returns
  403 (role is INTERN); the page reloads the role via `refreshProfile` and the route guard
  moves the user to the intern portal.

Verification (2026-10-11): backend 30 files / 499 tests; DB harness 140/140 (incl.
concurrent activation); backend tsc + oxlint (only pre-existing empty-file warnings);
frontend tsc + eslint (0 problems) + build pass; migration dry-run then push; read-only
remote check (1 placement backfilled, 0 NULL `internship_id`, FK RESTRICT, old unique
constraint gone, partial index present, events RLS on + no anon/authenticated grants +
service_role SELECT/INSERT only, the three functions service_role-only and not SECURITY
DEFINER, 9 migrations recorded); live 401 checks for the placement routes.

Not verified live: a real HR create → activate → cancel run in the browser (needs an
HR session and a selected applicant); please run it through the UI.

### 5. Admin user and system management — COMPLETE (2026-10-11)

- Before: ADMIN existed only in type unions; the role check rejected it, and the admin/users/audit
  backend files were empty placeholders; no admin routes or pages.
- Roles: one role per account; ADMIN gets no HR/Mentor/Intern access (each endpoint/RPC checks its
  own role). Admins manage only staff roles (HR/MENTOR/ADMIN); APPLICANT/INTERN stay
  workflow-owned (`role_not_staff`).
- Deactivation: `profiles.is_active`; `SupabaseAuthGuard` refuses inactive accounts with 403
  (fails closed); the backend also bans the Auth user (`ban_duration`) and lifts it on
  reactivation. The DB step is idempotent, so a failed Auth step is retried by repeating the request
  (the UI shows a warning). Frontend treats inactive profiles as having no portal.
- Protections in the database: no change to one's own account, at least one active admin
  (advisory lock + actor re-check; proven with a two-session test), a Mentor with scheduled/active
  placements can't be demoted or deactivated, deactivation needs a reason.
- Staff creation: backend creates a confirmed, password-less Auth user (sign-in with the
  one-time link on /login; no invitation email), then the profile via
  `admin_create_staff_profile`; on failure the Auth user is deleted. Duplicate emails → 409.
- Audit: `admin_audit_events` (who, what, from→to, reason, email snapshot), append-only.
- API (ADMIN only): `GET /admin/overview`, `GET/POST /admin/users`,
  `PATCH /admin/users/:id/role`, `PATCH /admin/users/:id/status`, `GET /admin/audit-events`.
- UI: `/admin/dashboard`, `/admin/users` (filters, add staff, change role, deactivate/reactivate,
  audit trail), `/admin/roles` (what each role can do, as enforced), `/admin/settings`
  (read-only configuration status; booleans only, no secret values). Navbar ADMIN links.
- First admin: `cd backend && npm run admin:bootstrap -- --email <email> [--name "..."] [--confirm-role-change]`
  — run by the project owner. The account must exist in Supabase Auth with a confirmed email
  (Dashboard → Authentication → Users → Add user, Auto Confirm). Refused once any ADMIN exists;
  applicant/intern accounts refused; converting HR/Mentor requires the flag.

Verification (2026-10-11): DB harness 188/188 (48 new admin tests incl. concurrent mutual
deactivation); backend 31 files / 552 tests; tsc + oxlint (exit 0; only pre-existing empty-file
warnings); frontend tsc + eslint (0 problems) + build; migration dry-run then push; read-only
remote check (role check includes ADMIN, 10/10 profiles active, browser privileges on profiles =
authenticated SELECT only, audit RLS on and no browser grants, all 7 functions service_role-only,
not SECURITY DEFINER, 10 migrations); live 401 checks for all admin routes; bootstrap script
argument check only (not run against an account).

Not verified live: no ADMIN account exists yet, so the Admin portal has not been exercised with a
real session. Next step for the owner: run the bootstrap command, sign in, add a Mentor.

### 6. Mentor assignment/reassignment — COMPLETE (2026-10-11)

- Reused: `mentor_profile_id` on placements, `assign_intern_placement_mentor` (same signature),
  Mentor RPCs that already scope access by `mentor_profile_id`, the HR assignment card.
- Rules (database): HR only (ADMIN does not inherit it; Mentors can't assign themselves);
  SCHEDULED/ACTIVE placements only (`placement_not_assignable`); active MENTOR accounts only
  (`mentor_inactive`); re-assigning the same Mentor refused; removal is a separate action with an
  optional reason. Lock order placement → Mentor profile; a concurrent admin demotion of the Mentor
  is serialized (proven with a two-session test).
- Access follows the assignment: after reassignment/removal the previous Mentor can no longer list
  the placement, read its tasks or create tasks (tested); existing tasks stay with the placement.
- History: MENTOR_ASSIGNED (from → to names) and MENTOR_UNASSIGNED (with reason) events, shown in
  the HR placement history.
- API: `POST /hr/placements/:id/mentor/unassign` (new); `GET /hr/mentors` now includes
  `openPlacements` (information only — no automatic assignment or balancing).
- UI: Mentor card shows workload per Mentor, assign/change, remove dialog, read-only for closed
  placements, and an explanation when no active Mentors exist (admin adds them).

Verification (2026-10-11): DB harness 218/218 (30 new); backend 31 files / 564 tests; tsc + oxlint
exit 0; frontend tsc + eslint + build; migration dry-run then push; read-only remote check (3
functions service_role-only, not SECURITY DEFINER, new list return type, 11 migrations);
live 401 checks for the Mentor routes.

Not verified live: no Mentor account exists yet (0 MENTOR profiles), so assignment has not been run
against real data; needs an admin to create a Mentor first.

### 7. Mentor dashboard and task management — COMPLETE (2026-10-11); task part RETIRED 2026-10-18

Superseded: the task workflows were removed from the portal on 2026-10-18 (see "Feature 2026-10-18").
The Mentor dashboard keeps the placement list and weekly-report review.

- Reused: `intern_tasks`, Mentor-scoped RPCs and routes, the Mentor workspace layout.
- Task lifecycle: ASSIGNED → IN_PROGRESS → COMPLETED (intern). A COMPLETED task awaits the Mentor:
  accept (optional feedback, final) or request changes (feedback required → back to IN_PROGRESS;
  the intern resubmits). Mentor edits (title/description/due date/priority) and cancels (reason
  required) only open tasks. All enforced in the database; constraints keep review/cancellation
  fields consistent.
- Authorization: Mentor actions go through `mentor_lock_task` (role, assignment, ACTIVE placement;
  a task of another Mentor's placement answers "not found"). Reassignment removes edit/review
  rights immediately (tested).
- History: `intern_task_events` records every action with actor, from → to, notes/feedback/reasons;
  only events from now on (no fabricated history).
- API (MENTOR): `GET /mentor/placements` (+ training and task counts),
  `GET /mentor/placements/:id/task-events`, `PATCH /mentor/tasks/:id`,
  `POST /mentor/tasks/:id/cancel`, `POST /mentor/tasks/:id/review`; create accepts `priority`.
  Intern `PATCH /intern/me/tasks/:id/status` accepts an optional `note`.
- UI: Mentor dashboard summary (active interns, open, awaiting review, overdue), per-placement counts,
  task list sorted by what needs attention, create with priority, edit/cancel/review dialogs,
  per-task history. Intern task types/validation accept the new fields (full intern UI: Feature 8).

Verification (2026-10-11): DB harness 262/262 (44 new); backend 31 files / 595 tests (3 consecutive
full runs green; one earlier run had a single 404-vs-403 failure in the HTTP matrix that did not
reproduce); tsc + oxlint exit 0; frontend tsc + eslint + build; migration dry-run then push;
read-only remote check (old signatures gone, 9 functions service_role-only and not SECURITY
DEFINER, task history RLS on with no browser grants, 12 migrations); live 401 checks.

Not verified live: no Mentor account and no tasks exist yet.

### 8. Intern dashboard, tasks, weekly reports — COMPLETE (2026-10-11); tasks RETIRED 2026-10-18

Superseded for tasks: the intern Tasks page and dashboard card were removed on 2026-10-18 (see
"Feature 2026-10-18"). Weekly reports are unchanged.

- Removed the intern "preview" mode (`features/intern/dev-preview.ts`): it bypassed the INTERN route
  guard in development and showed fictional placement data. Placeholder Training Reports and
  Profile pages replaced with real ones.
- Tasks (intern): sorted by what needs action; priority, due/overdue, Mentor feedback, cancellation
  reason; start / mark completed with an optional progress note (stored in the task history).
- Weekly reports: one per week of the active placement (Monday-based; future weeks and weeks outside
  the placement refused). Drafts are private; submit requires a summary; the assigned Mentor accepts
  or returns with required feedback; returned reports are edited and resubmitted; accepted reports are
  final. Full history in `intern_weekly_report_events`.
- Intern dashboard: placement, Mentor contact, task counts, this week's report status.
  My Internship shows the Mentor. My Profile shows the intern's own application profile read-only
  (`GET /intern/me/profile`, INTERN only, own data).
- Mentor: per-placement "Weekly reports" section (read, accept, return with feedback) and a
  "Reports to review" dashboard count.
- API: INTERN `GET /intern/me/weekly-reports`, `PUT /intern/me/weekly-reports/:weekStart`,
  `POST /intern/me/weekly-reports/:id/submit`, `GET /intern/me/profile`; `GET /intern/me/placement`
  now includes `mentor` (name/email). MENTOR `GET /mentor/placements/:id/weekly-reports`,
  `POST /mentor/weekly-reports/:id/review`.

Verification (2026-10-11): DB harness 291/291 (29 new); backend 32 files / 641 tests; tsc + oxlint exit
0; frontend tsc + eslint + build; migration dry-run then push; read-only remote check (7 functions
service_role-only and not SECURITY DEFINER, both tables RLS on with no browser grants, reports have no
DELETE, events append-only, 13 migrations, Mentor FK name confirmed); live 401 checks.

Not verified live: the only INTERN account has no assigned Mentor and no tasks/reports yet; a real
intern session was not exercised.

### 9. Cross-role progress and auditability — COMPLETE (2026-10-11)

- HR `/hr/intern-progress` ("Intern Progress"): scheduled/active placements with Mentor (flags missing
  or deactivated Mentors), task progress (accepted/total, open, awaiting review, overdue), weekly
  reports submitted vs. weeks elapsed, last activity; links to the application/placement. Counts
  only — task and report content stays with intern and Mentor. ADMIN and MENTOR are refused.
- Audit trails now in place (all append-only, actor + timestamp + from/to + reason/note):
  application status (`application_status_events`), training planning (`training_plan_events`),
  placements incl. Mentor assignment (`intern_placement_events`), accounts
  (`admin_audit_events`), tasks (`intern_task_events`), weekly reports
  (`intern_weekly_report_events`). Shown in the HR application page, HR planning page, Admin
  pages and the Mentor task history.
- Hardening: browser roles had TRUNCATE on six older base tables (not reachable through the Supabase
  data API, but TRUNCATE ignores RLS); revoked.

## Final regression (2026-10-11)

Local:
- Backend: `tsc` clean; vitest 33 files / 649 tests passed; oxlint exit 0 (only the pre-existing
  empty-placeholder-file warnings); `nest build` exit 0.
- Database harness: 308/308 (10 files: review submission, status history, planning incl.
  concurrency, placement lifecycle incl. concurrency, admin incl. concurrency, Mentor assignment incl.
  concurrency, Mentor tasks, weekly reports, HR progress, browser-privilege boundary).
- Frontend: `tsc` clean, eslint 0 problems, `vite build` passed.

Live (linked project, read-only queries and unauthenticated HTTP only):
- 15 migrations recorded; no public function executable by anon/authenticated; no SECURITY DEFINER
  functions; RLS enabled on every public table; the only browser grant left is authenticated SELECT
  on `profiles` (own row via policy); all six history tables refuse UPDATE/DELETE even for
  service_role.
- 47 protected API routes return 401 without a token; `GET /internships` returns only
  id/title/isActive/createdAt; frontend routes serve.

Not verified (needs real sessions; no ADMIN or MENTOR account exists and I did not create users):
the role-by-role browser flows from AGENTS.md "Minimum role tests" with real tokens, Admin staff
creation, Mentor assignment with real Mentors, intern tasks/reports with real data.

Suggested owner run-through:
1. `cd backend && npm run admin:bootstrap -- --email <admin email>` (Auth user created first in the
   dashboard with Auto Confirm), sign in at /login → /admin/dashboard.
2. Admin → User Management → add a Mentor.
3. HR → Training Planning: set seats → select an applicant → schedule, activate placement → assign
   the Mentor → check Intern Progress.
4. Mentor → assign a task; Intern → start/complete it, write and submit a weekly report;
   Mentor → review both; HR → Intern Progress counts update.
5. Deactivate a test account in Admin and confirm its next request is refused.


## Validation session (2026-10-11, afternoon)

Re-verified from scratch (not taken from earlier reports):
- `supabase migration list --linked`: 15 local = 15 remote, same versions.
- Backend tsc clean; vitest 33 files / 656 tests (Node 20 and Node 22.23.3); oxlint exit 0;
  DB harness 308/308; frontend tsc, eslint (exit 0), vite build.
- Live data (read-only counts): profiles APPLICANT 8, HR 1, INTERN 1, no ADMIN, no MENTOR;
  11 confirmed Auth users, 1 without a profile; applications DRAFT 13 / NEW 6 / SELECTED 1; one
  internship, seats not set; one ACTIVE placement without a Mentor; 0 tasks, 0 reports.
- Public auth settings endpoint: `disable_signup: false` (public sign-up ON), email confirmation
  required. No portal code uses public sign-up (accounts are created only through the admin API;
  /login uses `shouldCreateUser: false`), so it can be turned off safely.

Fixed (confirmed by evidence):
- Backend did not boot on the shell's default Node 20 (`@supabase/supabase-js` 2.117 needs native
  WebSocket → Node 22+). Added `.nvmrc` (22) at root/backend/frontend and `engines.node >=22`.
  The bootstrap script needs Node 22 as well.
- Review-email sender was hardcoded to Resend's test sender (only reaches the Resend account owner).
  Now `EMAIL_FROM` (validated, single line); required when `NODE_ENV=production` (refuses to start
  without it); development falls back to the test sender with a warning. Admin → System Settings
  shows whether it is set. +7 tests.
- `backend/.env.example` listed variables the backend never reads (`NEXT_PUBLIC_*`) and missed the
  real ones; rewritten with placeholders only.

### Placement completion (rules approved by the owner, 2026-10-11) — COMPLETE

Rules: HR only; early end (before the planned end date) needs a reason; refused while tasks are
open or completed-but-unreviewed, or weekly reports await review; the intern keeps the INTERN role
with read-only access; completion frees the seat; no second placement for the same application.
*Superseded 2026-10-14:* completion no longer frees a seat. Seats are cumulative per
opportunity and only an explicit HR selection release frees one (see "Feature 2026-10-14").
- DB: `complete_intern_placement`, `intern_visible_placement_id`, updated `list_my_intern_tasks` /
  `list_my_weekly_reports`; 32 new DB tests incl. a concurrency test (task creation waits for and is
  refused after completion).
- API: `POST /hr/placements/:id/complete` (`{ note? }`, HR only); `GET /intern/me/placement` returns the
  active, else latest completed placement (+ `completedAt`, `completionNote`, `endedEarly`).
- UI: HR "Complete placement" dialog (reason required when early); intern pages show
  Completed / Ended early and become read-only (weekly reports stop at the completion date).
- Verification: DB harness 340/340; backend 668/668 (Node 22); tsc, oxlint exit 0; frontend tsc,
  eslint, build; dry-run → push; read-only check (16 migrations, functions service_role-only, not
  SECURITY DEFINER, existing ACTIVE placement unchanged); live 401 on the new route.
- Not verified live with real accounts.

### End-to-end walkthrough with real accounts (status: NOT YET RUN)

Prerequisites (owner): run everything on Node 22 (`nvm use` in each folder). Supabase's built-in
email service may only deliver sign-in links to project team addresses; use inboxes you control
that receive Supabase login emails, or configure custom SMTP in Supabase Auth.

| Step | Who | Action | Expected | Status |
|---|---|---|---|---|
| 0 | Owner | Create the admin Auth user (Dashboard → Authentication → Add user, Auto Confirm), then `cd backend && nvm use && npm run admin:bootstrap -- --email <admin>` | "✓ … first administrator" | Not run |
| 1 | Admin | Sign in at /login → /admin/dashboard; User Management → add a Mentor (email you control) | Mentor listed; audit "added as Mentor" | Not run |
| 2 | Admin | Try /hr/dashboard | Redirected away; HR API 403 | Not run |
| 3 | HR | Training Planning → set seats on the internship (≥ 1 more than active placements) | Seats saved, planning history entry | Not run |
| 4 | HR | Open the existing ACTIVE placement (the SELECTED application) → assign the Mentor | Placement history "Mentor assigned" | Not run |
| 5 | Mentor | Sign in → /mentor: see the intern; create a task (priority High, due date) | Task listed; dashboard counts | Not run |
| 6 | Intern | Sign in → /intern/tasks: start with a note, mark completed | Mentor sees "Awaiting review" + note in history | Not run |
| 7 | Mentor | Request changes with feedback; Intern resubmits; Mentor accepts | States + history correct | Not run |
| 8 | Intern | /intern/training-reports: save a draft for last week, submit | Mentor sees it only after submit | Not run |
| 9 | Mentor | Return with feedback; Intern edits and resubmits; Mentor accepts | Accepted, final | Not run |
| 10 | HR | /hr/intern-progress | Mentor, 1/1 task accepted, report counts, last activity | Not run |
| 11 | Each role | Visit another role's URL; check DevTools → Network → `Authorization: Bearer` | Blocked / header present | Not run |
| 12 | Admin | Deactivate then reactivate a test account | Its requests get 403 while inactive | Not run |
| 13 | HR | After step 10, open the placement → Complete placement (reason, since it ends before 2027-01-11) | Intern sees "Ended early", read-only; HR progress shows Completed | Not run |
| Optional | HR | Full new placement: select a NEW application → schedule → activate | Applicant becomes INTERN (irreversible today — use a test applicant only) | Not run |

Steps 4–10 reuse the existing ACTIVE placement, so no applicant has to be converted to test the
Mentor/Intern/report/progress chain.

## Fix 2026-10-13: structured CV list entries crashed the HR application page

- Symptom: `/hr/applications/:id` threw "Objects are not valid as a React child (found: object with
  keys {language, proficiency})".
- Root cause (read-only DB scan): the CV parser passed the model's `languages` array through
  unchanged, so some stored data has `{ language, proficiency }` objects instead of strings: the
  SELECTED (now INTERN) application's submitted data and its applicant profile, plus two DRAFT
  applications (submitted and original extraction). Not specific to INTERN status; any application
  with such data crashed the shared `ApplicantDataView`. No other CV field had unexpected types.
- Fix (no data changed): `features/applications/cv-text.ts` turns entries into text
  ("English — Advanced"; other objects keep their readable values; empty/malformed entries dropped).
  Used by `ApplicantDataView` (HR details, applicant profile, intern profile — lists, contact fields,
  education/experience entries), `data-diff`, the applicant review form (so the two DRAFTs can now be
  submitted; the DTO requires strings) and the applicant profile form (no "[object Object]").
  Backend parser now stores strings via `domain/types/cv-list-text.ts`; prompt asks for strings.
- Tests: frontend gets Vitest 4.1.11 (`npm test`; installed with `--legacy-peer-deps` because npm
  10.8 crashed resolving Vitest's optional browser peers): 3 files / 7 tests. Backend +3 tests.
- Results: frontend tests 7/7, tsc -b exit 0, eslint exit 0, build OK; backend 34 files / 671 tests,
  tsc, oxlint exit 0. Not yet re-checked in the browser with the HR account.

## Feature 2026-10-13: intern withdraws a task submission (RETIRED 2026-10-18)

Superseded: withdrawal was removed with the task feature (see "Feature 2026-10-18").

Rules (owner-approved 2026-10-13): only the intern of the task's ACTIVE placement; only while the
submission awaits review (status COMPLETED, `review_status` NULL); only if the task has a due date;
only until the due day ends in Asia/Hebron (refused from 00:00 Asia/Hebron the day after the due date;
the database clock decides). Withdrawal sets the task back to IN_PROGRESS, changes nothing else, and
adds a WITHDRAWN history event; the earlier SUBMITTED event stays. Withdraw and Mentor review lock
placement → task in the same order, so whichever commits second is refused.

- DB: migration `20261013000000_withdraw_task_submission.sql`; test `110_withdraw_task_submission`
  (39 checks incl. exact deadline instants, timezone, both race orders, duplicate withdrawal).
- API: `POST /intern/me/tasks/:taskId/withdraw` (INTERN only, no body; 404 not found / other
  intern, 409 not withdrawable / deadline passed / no due date, 403 wrong role).
- UI: new Tasks intro text; "Withdraw submission" on eligible tasks; confirmation dialog with loading
  state and a double-click guard; success notice; refusals shown and the list refreshed. Mentor history
  shows "Intern withdrew the submission"; a refused Mentor review refreshes the Mentor's task list.
- Frontend test stack: @testing-library/react 16.3.0, @testing-library/dom 10.4.0, jsdom 26.1.0
  (dev only, installed with `--legacy-peer-deps`).
- Results: DB harness 379/379; backend 34 files / 685 tests, tsc, oxlint exit 0; frontend vitest
  5 files / 15 tests, tsc -b exit 0, eslint exit 0, build OK.
- Applied 2026-10-13 with the owner's explicit authorization (this migration only): pre-check read-only
  (old event-type check is a subset of the new one; existing events CREATED/STARTED valid; no name
  clashes; `intern_lock_active_placement` present; Asia/Hebron known), `supabase db push --linked
  --dry-run` listed only this file, then `--yes`. Read-only verification: 17 migrations, local = remote;
  WITHDRAWN in the check; both functions service_role-only, SECURITY INVOKER, pinned search_path;
  0 browser-callable public functions; live rule samples correct (due-day 23:59:59.999999 Hebron open,
  next-day 00:00 Hebron closed, no due date closed); live task data unchanged (1 task, 2 events).
- Running backend (Node 22, watch mode) serves `POST /intern/me/tasks/:id/withdraw` (401 without token).
- **Not verified in a browser**: needs the intern's and Mentor's real sessions (magic-link sign-in to
  their inboxes); not done by the assistant. Owner walkthrough below.

Owner browser walkthrough (live data has one task, IN_PROGRESS, due 2026-10-17):
1. Intern → /intern/tasks: Mark completed → the card shows "Awaiting review" and "Withdraw submission".
2. Withdraw submission → Cancel: nothing changes. Withdraw again → confirm: success message, task back
   to "In progress" with "Mark completed"; DevTools shows `POST …/withdraw` with `Authorization: Bearer`.
3. Mentor → /mentor: the task is not "Awaiting review"; History shows "Intern withdrew the submission".
4. Intern: Mark completed again → Mentor: Review → Accept → intern card shows "Accepted", no Withdraw button.
- Past-due and no-due-date refusals and the review race are covered by the DB tests (110) and the live
  rule samples; reproducing them live would need new or altered task data (the Mentor could create a
  task without a due date through the UI if a live check is wanted).

## Feature 2026-10-14: training capacity, selection release, approval and application intake

Rules (owner-approved 2026-10-14; summarized in the header of
`supabase/migrations/20261014000000_capacity_selection_and_intake.sql`):
- `internships.is_active` = listed for applicants; `internships.selection_status` = HR approval
  (`NOT_APPROVED` for new types unless approved at creation, `OPEN`, `CLOSED`);
  `internships.capacity` = applicants that may be selected over the opportunity's cycle (NULL = not
  set). One opportunity row = one cycle; a later cohort is a new opportunity.
- Seats are cumulative: every SELECTED application resolved to the opportunity consumes a seat
  (`training_opportunity_seats_consumed`), including those whose placement was completed or
  cancelled. Only an explicit HR selection release frees a seat.
- Release (`release_application_selection`, HR only, reason required) is final (trigger
  `applications_release_is_final`). It is refused if already released, if the application is not
  SELECTED, or if it has a scheduled, active or completed placement. The application stays SELECTED
  in history and cannot get a new placement (`selection_released`); a `SELECTION_RELEASED`
  planning event is recorded.
- Selection (`update_application_status_v2`) requires an OPEN opportunity (`training_not_approved`,
  `training_selection_closed`), a capacity (`training_capacity_not_set`) and seats consumed below
  capacity (`training_capacity_full`). `create_intern_placement` and `activate_intern_placement`
  check cumulative seats and refuse a released selection.
- Capacity cannot go below seats consumed (`capacity_below_selected`); an opportunity cannot return
  to NOT_APPROVED once anyone was selected into it (`training_has_selections`).
- Application intake (`portal_settings`, changed only by ADMIN through
  `admin_set_application_intake`, audited as `SETTING_UPDATED`): when closed, new applications are
  refused by trigger `applications_intake_guard` and review submission by
  `submit_application_review_v2`; the backend answers 409 `APPLICATIONS_CLOSED` before CV parsing,
  storage, email or account creation. Existing drafts and CVs are kept; HR work continues.
- Migration backfill: existing opportunities with a capacity or a selected application became OPEN,
  the others NOT_APPROVED.

API: `GET /applications/intake` (public), `POST /applications/:id/release-selection` (HR),
`GET /internships/manage` (HR; `GET /internships` lists only listed types),
`GET/PATCH /admin/settings/application-intake` (ADMIN). `create_training_opportunity` and
`update_training_opportunity` gained `p_is_active` and `p_selection_status`; the old signatures were
dropped, so this backend version and the migration must be deployed together.

UI: Training Planning (approval status, listing, Approve / Close / Reopen selection, seat summary:
capacity, total selected, released, remaining), application details (Select disabled with the reason,
Release Selection card), placement section, closed-intake states on the Apply and review pages, and
an Application intake card in Admin → System Settings.

Tests: `supabase/tests/sql/120_capacity_intake.test.sql` (including two-session races for the last
seat and for closing intake during review submission) plus backend and frontend specs. Local results
on 2026-10-14, re-run on 2026-10-16: backend 37 files / 741 tests, DB harness 445/445, frontend
9 files / 28 tests; backend tsc and oxlint, frontend tsc and eslint pass.

Applied 2026-10-14 with the owner's approval: the dry run listed only this file, then push. Read-only
verification afterwards: 18 migrations; Front-End Developer became OPEN with capacity still NULL and
1 seat consumed; the existing selected application, active placement, intern profile and task were
unchanged; application intake open; new functions executable by service_role only.

Owner browser check (reported by the owner): Training Planning shows Front-End Developer listed and
open with capacity unset; selection is disabled because capacity is unset, and for a QA request not
linked to an approved opportunity; Admin → System Settings shows application intake open.

Not verified live: setting a capacity, selecting into a seat, releasing a selection, closing and
reopening intake, the closed-intake applicant screens, and the concurrency behaviour on the live
project.

## Feature 2026-10-17: Mentor required for activation, completed history, no Mentor gap

Rules (owner-approved 2026-10-17), migration `20261017000000_mentor_activation_history_and_reassignment.sql`
(`CREATE OR REPLACE`, signatures, return types, volatility and SECURITY INVOKER unchanged;
service_role-only grants restated; no table, column or data change):
- `activate_intern_placement` refuses a placement without a Mentor (`mentor_required`, 409), a
  Mentor id that is not a MENTOR profile (`mentor_profile_required`) or a deactivated Mentor
  (`mentor_inactive`). The Mentor is read from the placement row locked FOR UPDATE and the Mentor
  profile is locked FOR SHARE (placement first, then Mentor). Opening an opportunity and selecting
  an applicant do not involve a Mentor. Existing active placements are untouched.
- `list_mentor_intern_tasks`, `list_mentor_task_events`, `list_mentor_weekly_reports` accept ACTIVE
  or COMPLETED placements (still the placement's current Mentor, now also an *active* MENTOR
  profile). SCHEDULED and CANCELLED stay refused (`placement_not_active`). Every write
  (task create/edit/cancel/review, report review) stays ACTIVE-only and is unchanged.
- `unassign_intern_placement_mentor` refuses ACTIVE placements (`active_placement_requires_mentor`,
  409); removal from SCHEDULED placements is unchanged. HR replaces an active placement's Mentor with
  `assign_intern_placement_mentor`, a single UPDATE under the placement lock (unchanged).

Backend: `mentor_required` and `active_placement_requires_mentor` mapped; activation-specific wording
for `mentor_inactive` / `mentor_profile_required` (409). Frontend: Activate disabled with an
explanation until a Mentor is assigned; no "Remove Mentor" on active placements (replacement only);
Mentor dashboard shows completed placements' tasks and reports read-only ("Completed — read-only",
no create, edit, cancel or review controls).

Tests: new `supabase/tests/sql/130_mentor_activation_and_history.test.sql` (activation rules,
opportunity/selection without Mentor, completed read-only access, isolation between Mentors,
cancelled/scheduled unreadable, deactivation/demotion, three two-session races); 040, 060 and 120
updated for the new rules (060 removal now on a scheduled placement). Backend and frontend specs
added. Local results 2026-10-17 (Node 22): DB harness 528/528; backend 37 files / 748 tests,
tsc, oxlint (93 pre-existing empty-file warnings), nest build; frontend 11 files / 39 tests,
eslint, build.

Applied 2026-10-17 with the owner's approval: `supabase db push --linked` applied only
`20261017000000_mentor_activation_history_and_reassignment.sql` (exit 0). Read-only verification
afterwards: 19 local and 19 remote migration versions, none pending and none remote-only; the five
target functions each have one definition whose body matches the reviewed post-migration build, with
signatures, return types, volatility, SECURITY INVOKER, `search_path`, owner and service_role-only
execution as expected; no other change to functions, tables, indexes, triggers, RLS, table privileges
or policies; aggregate placement and Mentor counts unchanged (1 ACTIVE placement with an active
Mentor, 0 SCHEDULED placements).

Not verified live: the functions were not invoked on the live database (their behaviour rests on the
local tests and the matching bodies), no browser or end-to-end test was run, and whether the push ran
the file in a single transaction was not checked.

## Fix 2026-10-17: empty applicant/intern profiles from legacy submissions

Cause (read-only audit): applications submitted through the pre-repository legacy flow kept the
applicant-reviewed data in `applications.extracted_data` but never wrote `applicants.profile_data`,
so the applicant and intern profile pages showed no CV sections. The current submission function
(`submit_application_review_v2`) already writes `profile_data` and was not changed.

Migration `20261017010000_backfill_applicant_profile_data.sql` (owner-approved 2026-10-17):
- Updates `applicants.profile_data` only where it is SQL NULL; any non-NULL value (even `{}`) is
  left untouched, and the condition is re-checked by the UPDATE itself.
- Source: the applicant's own applications (`applications.applicant_id`) that are non-DRAFT, have
  `submitted_at`, and have an `extracted_data` JSON object with at least one correctly typed section;
  the latest by `submitted_at DESC, created_at DESC, id DESC`.
- Copies only the seven sections written by the current flow (summary, education, experience,
  skills, languages, certifications, links); a wrongly typed section becomes null. Safe to re-run.

Tests: `supabase/tests/sql/140_backfill_applicant_profile_data.test.sql` runs the real migration file
against fixtures (fill, preservation, DRAFT/invalid/no-`submitted_at` sources, latest submission,
`created_at` and id tie-breaks, no cross-applicant data, unrelated tables unchanged, re-run, browser
privileges). Local results 2026-10-17: targeted 20/20, full DB harness 548/548. A mutation check (the
`created_at` tie-break removed from a copy of the migration) made the tie-break test fail as intended.

Applied 2026-10-17 with the owner's approval after a read-only preflight and a dry run listing only
this file: `supabase db push --linked` (exit 0). Read-only verification afterwards: 20 local and 20
remote migration versions, none pending and none remote-only; 9 applicants before and after; the 3
previously NULL profiles (2 APPLICANT, 1 INTERN) are filled with the seven-key shape and none remain
NULL; aggregate before/after fingerprints show the 6 previously filled profiles, the other applicant
columns, `applications`, `profiles` (roles included) and the `auth.users` ids unchanged. Browser check
(reported by the owner): the applicant and intern profile pages show the restored data correctly.

Caveats: treating legacy non-DRAFT `extracted_data` as applicant-reviewed relies on the documented
meaning of that column (the legacy code itself is not in the repository); the CLI did not display the
migration's count notice (the count was verified separately); the `auth.users` fingerprint covered ids
only; which rows were filled is not stored, so reverting would require a separately reviewed migration.

## Feature 2026-10-18: intern task workflows retired

Owner-approved plan (decision D6): remove tasks from every role's screens and workflows, keep the
task data as an archive, keep weekly reports working.

**Batch 1 (application code) — DONE locally, not committed.**
- Backend: `modules/intern-tasks` deleted. Weekly reports moved unchanged to `modules/weekly-reports`
  (same five routes, DTOs, guards and database functions; own error mapping; the
  `placement_not_active` and `invalid_review_decision` messages no longer mention tasks).
  `GET /mentor/placements` moved to `modules/mentors` (same URL and guards). The nine task routes
  now return 404. Mentor placement and HR progress responses no longer contain task fields; their
  parsers accept database rows with or without the old task columns, so the backend works before
  and after the migration below.
- Frontend: Tasks page, hook, services, labels and the Mentor task manager/dialogs deleted; task
  navigation, dashboard cards/counts and the HR progress Tasks column removed; task wording removed
  from HR placement dialogs and Roles & Permissions.
- Checks run 2026-10-18 (local): backend tsc exit 0, vitest 37 files / 747 tests passed, oxlint
  exit 0 (88 pre-existing empty-file warnings); frontend tsc exit 0, vitest 13 files / 84 tests
  passed, eslint exit 0. No browser test yet.

**Batch 2 (database) — APPLIED + VERIFIED 2026-10-18 (owner-authorized).**
- Migration `20261018000000_retire_intern_task_workflows.sql` (see the migrations table). It
  contains no DML on the task tables. Preflight and postflight checks make it fail instead of
  continuing if the task tables or `intern_task_clean_text` are missing, if any public function
  still references the task tables, or if any application role keeps a write privilege on them
  (checked with `has_table_privilege` / `has_any_column_privilege` after the REVOKE, because REVOKE
  only removes grants made by the executing role).
- SQL tests: `070` and `110` (task-only) removed; `060`, `090`, `100`, `130` ported to weekly
  reports; new `160` with a seed (`160_…before-20261018000000.sql`, run by `run.sh` just before
  that migration) that creates task history with the old functions, then proves every task row and
  event survived unchanged, the archive is SELECT-only for service_role, the retired functions are
  gone, weekly reports still work, HR last activity ignores task events, and completion is no
  longer blocked by open tasks while the pending-report block stays.
- `npm run test:db` 2026-10-18 (throwaway local PostgreSQL): 491 passed, 0 failed.
- Read-only live checks before applying (2026-10-18): archive 1 task (COMPLETED, reviewed) and 6
  events; 0 tasks blocking completion; tables owned by `postgres`; service_role still had write
  grants (all on `intern_tasks`; INSERT/REFERENCES/TRIGGER/MAINTAIN on `intern_task_events`) from
  Supabase default privileges; all 13 functions present with the expected signatures and no
  dependents; live bodies of the three rebuilt and the weekly-report functions identical to the
  repository.
- Applied 2026-10-18 with `supabase db push --linked` after a dry run listing only this migration
  (exit 0). Read-only verification afterwards: migration history ends at `20261018000000`
  (22 versions); the 13 functions are gone; the rebuilt functions match the migration and return no
  task columns; completion keeps the HR, ACTIVE, early-end, pending-report and event rules without
  the task guard; `intern_task_clean_text` and the weekly-report functions are unchanged; archive
  rows unchanged (1 / 6); service_role has SELECT only on both tables; anon/authenticated/PUBLIC
  have no access.
- Not verified: browser or end-to-end use of the portal against the migrated database.

## Known follow-ups

- Public sign-up: DISABLED on the remote project (resolved 2026-10-16). Verified 2026-10-16 with a
  read-only GET of the remote Auth settings endpoint (HTTP 200): `disable_signup: true`,
  `mailer_autoconfirm: false` (email confirmation required), email provider enabled. It was ON
  (`disable_signup: false`) when checked on 2026-10-11 and 2026-10-14. The portal does not use public
  sign-up: applicant accounts are created server-side through the Admin API after review submission,
  staff accounts through Admin provisioning, and /login uses `shouldCreateUser: false`.
  Not yet tested end-to-end under the new setting: applicant account creation on review submission.
  Not verified: Site URL, redirect URLs, SMTP / email deliverability. `supabase/config.toml`
  (`enable_signup = true`) configures only the local CLI stack; it neither reflects nor sets the
  remote project.
- Email: set `EMAIL_FROM` to a sender on a domain verified in Resend before real use (now
  configurable and enforced in production). Dev override
  `APPLICATION_REVIEW_EMAIL_OVERRIDE` is refused unless `NODE_ENV` is development/test.
- Git (updated 2026-10-16): the project has its own local Git repository at the project root on
  branch `main`, with no commits and no remote configured yet. Earlier there was no project
  repository; the only one, `backend/.git`, had no commits and was moved out of the project
  (kept as a backup outside it) before the root repository was created.
- Shell default is Node 20; the project now declares Node 22 (`.nvmrc`, `engines`). Use `nvm use`.
- Staff accounts created by an Admin get no invitation email; the admin tells the person to sign in
  at /login with the one-time email link.
- Intern profile is read-only; corrections go through HR (no intern self-edit RPC exists).
- One unreproduced 404-vs-403 failure was seen once in the HTTP authorization matrix (all later full
  runs green); watch for recurrence.
