import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { SupabaseService } from '../database/supabase.service.js';

import { ApplicationsController } from '../../modules/applications/presentation/controllers/applications.controller.js';
import { ApplicantProfileController } from '../../modules/applications/presentation/controllers/applicant-profile.controller.js';
import { HrDashboardController } from '../../modules/hr/presentation/controllers/hr-dashboard.controller.js';
import { InternshipsController } from '../../modules/internships/presentation/controllers/internships.controller.js';
import { InternshipRequirementsController } from '../../modules/internships/presentation/controllers/internship-requirements.controller.js';
import { HrInternPlacementsController } from '../../modules/intern-placements/presentation/controllers/hr-intern-placements.controller.js';
import { InternPlacementController } from '../../modules/intern-placements/presentation/controllers/intern-placement.controller.js';
import { MentorPlacementsController } from '../../modules/mentors/presentation/controllers/mentors.controller.js';

import { ExportApplicationsUseCase, ListApplicationsUseCase } from '../../modules/applications/application/use-cases/list-applications.use-case.js';
import { GetApplicationCvUrlUseCase } from '../../modules/applications/application/use-cases/get-application-cv-url.use-case.js';
import { UpdateApplicantProfileUseCase } from '../../modules/applications/application/use-cases/update-applicant-profile.use-case.js';
import { ParseCvUseCase } from '../../modules/applications/application/use-cases/parse-cv.use-case.js';
import { SubmitApplicationUseCase } from '../../modules/applications/application/use-cases/submit-application.use-case.js';
import { CheckCvDuplicateUseCase } from '../../modules/applications/application/use-cases/check-cv-duplicate.use-case.js';
import { GetApplicantEligibilityUseCase } from '../../modules/applications/application/use-cases/get-applicant-eligibility.use-case.js';
import { GetApplicationReviewUseCase } from '../../modules/applications/application/use-cases/get-application-review.use-case.js';
import { SubmitReviewedApplicationUseCase } from '../../modules/applications/application/use-cases/submit-reviewed-application.use-case.js';
import { GetApplicationDetailsUseCase } from '../../modules/applications/application/use-cases/get-application-details.use-case.js';
import { UpdateApplicationStatusUseCase } from '../../modules/applications/application/use-cases/update-application-status.use-case.js';
import { MatchApplicationUseCase } from '../../modules/applications/application/use-cases/match-application.use-case.js';
import { GetApplicationMatchUseCase } from '../../modules/applications/application/use-cases/get-application-match.use-case.js';
import { GetApplicantProfileUseCase } from '../../modules/applications/application/use-cases/get-applicant-profile.use-case.js';
import { GetHrDashboardUseCase } from '../../modules/hr/application/use-cases/get-hr-dashboard.use-case.js';
import { ListInternshipsUseCase } from '../../modules/internships/application/use-cases/list-internships.use-case.js';
import { CreateInternshipUseCase } from '../../modules/internships/application/use-cases/create-internship.use-case.js';
import { UpdateInternshipUseCase } from '../../modules/internships/application/use-cases/update-internship.use-case.js';
import { TrainingPlanningService } from '../../modules/internships/application/services/training-planning.service.js';
import { TrainingPlanningController } from '../../modules/internships/presentation/controllers/training-planning.controller.js';
import { InternshipRequirementsService } from '../../modules/internships/application/services/internship-requirements.service.js';
import { CreateInternPlacementUseCase } from '../../modules/intern-placements/application/use-cases/create-intern-placement.use-case.js';
import { ActivateInternPlacementUseCase } from '../../modules/intern-placements/application/use-cases/activate-intern-placement.use-case.js';
import { InternWeeklyReportsController, MentorWeeklyReportsController } from '../../modules/weekly-reports/presentation/controllers/weekly-reports.controller.js';
import { WeeklyReportRepository } from '../../modules/weekly-reports/domain/repositories/weekly-report.repository.js';
import { EvaluationRepository } from '../../modules/evaluations/domain/repositories/evaluation.repository.js';
import { MentorEvaluationsController } from '../../modules/evaluations/presentation/controllers/mentor-evaluations.controller.js';
import { InternEvaluationsController } from '../../modules/evaluations/presentation/controllers/intern-evaluations.controller.js';
import { CertificateRepository } from '../../modules/certificates/domain/repositories/certificate.repository.js';
import { InternCertificatesController } from '../../modules/certificates/presentation/controllers/intern-certificates.controller.js';
import { HrCertificatesController } from '../../modules/certificates/presentation/controllers/hr-certificates.controller.js';
import { InternProfileController } from '../../modules/applications/presentation/controllers/intern-profile.controller.js';
import { HrInternProgressController } from '../../modules/intern-placements/presentation/controllers/hr-intern-progress.controller.js';
import { InternProgressService } from '../../modules/intern-placements/application/services/intern-progress.service.js';
import { GetApplicationIntakeUseCase } from '../../modules/applications/application/use-cases/get-application-intake.use-case.js';
import { ReleaseApplicationSelectionUseCase } from '../../modules/applications/application/use-cases/release-application-selection.use-case.js';
import { AdminSettingsService } from '../../modules/admin/application/services/admin-settings.service.js';
import { AdminController } from '../../modules/admin/presentation/controllers/admin.controller.js';
import { AdminUsersService } from '../../modules/admin/application/services/admin-users.service.js';
import { AdminOverviewService } from '../../modules/admin/application/services/admin-overview.service.js';
import { UnassignInternPlacementMentorUseCase } from '../../modules/intern-placements/application/use-cases/unassign-intern-placement-mentor.use-case.js';
import { CompleteInternPlacementUseCase } from '../../modules/intern-placements/application/use-cases/complete-intern-placement.use-case.js';
import { CancelInternPlacementUseCase } from '../../modules/intern-placements/application/use-cases/cancel-intern-placement.use-case.js';
import { GetApplicationInternPlacementUseCase } from '../../modules/intern-placements/application/use-cases/get-application-intern-placement.use-case.js';
import { ListHrMentorsUseCase } from '../../modules/intern-placements/application/use-cases/list-hr-mentors.use-case.js';
import { AssignInternPlacementMentorUseCase } from '../../modules/intern-placements/application/use-cases/assign-intern-placement-mentor.use-case.js';
import { GetMyInternPlacementUseCase } from '../../modules/intern-placements/application/use-cases/get-my-intern-placement.use-case.js';
import { ListMyMentorPlacementsUseCase } from '../../modules/mentors/application/use-cases/list-my-mentor-placements.use-case.js';

// HTTP-level authorization matrix: real controllers, real SupabaseAuthGuard
// and RolesGuard, and the same global ValidationPipe as main.ts. Supabase
// Auth and every use case are mocked, so this proves route protection and
// identity derivation, not database behavior.

type Role = 'APPLICANT' | 'INTERN' | 'MENTOR' | 'HR' | 'ADMIN';

const ROLES: Role[] = ['APPLICANT', 'INTERN', 'MENTOR', 'HR', 'ADMIN'];
const tokenFor = (role: Role) => `${role.toLowerCase()}-token`;
const idFor = (role: Role) => `${role.toLowerCase()}-user-id`;
// Verified, active users who have not set a password yet.
const pendingTokenFor = (role: Role) => `${role.toLowerCase()}-pending-token`;
const SET_AT = '2026-10-01T00:00:00Z';

const UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';
const REVIEW_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

function createSupabaseMock() {
  const users = new Map<string, { id: string; email: string; role: Role | null; active?: boolean; passwordSetAt?: string | null }>(
    ROLES.map((role) => [tokenFor(role), { id: idFor(role), email: `${role.toLowerCase()}@example.com`, role, passwordSetAt: SET_AT }]),
  );
  for (const role of ROLES) {
    users.set(pendingTokenFor(role), { id: `${role.toLowerCase()}-pending-id`, email: `p-${role.toLowerCase()}@example.com`, role, passwordSetAt: null });
  }
  users.set('no-profile-token', { id: 'no-profile-user-id', email: 'np@example.com', role: null });
  users.set('inactive-admin-token', { id: 'inactive-admin-id', email: 'ia@example.com', role: 'ADMIN', active: false, passwordSetAt: SET_AT });
  users.set('inactive-hr-token', { id: 'inactive-hr-id', email: 'ih@example.com', role: 'HR', active: false, passwordSetAt: SET_AT });
  users.set('inactive-pending-hr-token', { id: 'inactive-pending-hr-id', email: 'iph@example.com', role: 'HR', active: false, passwordSetAt: null });

  return {
    client: {
      auth: {
        getUser: vi.fn(async (token: string) => {
          const user = users.get(token);
          return user
            ? { data: { user: { id: user.id, email: user.email } }, error: null }
            : { data: { user: null }, error: { message: 'invalid JWT' } };
        }),
      },
      from: vi.fn(() => {
        let profileId: string | null = null;
        const query = {
          select: () => query,
          eq: (_column: string, value: string) => {
            profileId = value;
            return query;
          },
          maybeSingle: async () => {
            const user = [...users.values()].find((candidate) => candidate.id === profileId);
            return {
              data: user?.role ? { role: user.role, is_active: user.active ?? true, password_set_at: user.passwordSetAt ?? null } : null,
              error: null,
            };
          },
        };
        return query;
      }),
    },
  };
}

const useCaseTokens = [
  ListApplicationsUseCase, ExportApplicationsUseCase, GetApplicationIntakeUseCase, ReleaseApplicationSelectionUseCase, GetApplicationCvUrlUseCase, UpdateApplicantProfileUseCase,
  ParseCvUseCase, SubmitApplicationUseCase, CheckCvDuplicateUseCase, GetApplicantEligibilityUseCase, GetApplicationReviewUseCase,
  SubmitReviewedApplicationUseCase, GetApplicationDetailsUseCase, UpdateApplicationStatusUseCase,
  MatchApplicationUseCase, GetApplicationMatchUseCase, GetApplicantProfileUseCase, GetHrDashboardUseCase,
  ListInternshipsUseCase, CreateInternshipUseCase, UpdateInternshipUseCase, CreateInternPlacementUseCase,
  ActivateInternPlacementUseCase, CancelInternPlacementUseCase, CompleteInternPlacementUseCase, GetApplicationInternPlacementUseCase, ListHrMentorsUseCase,
  AssignInternPlacementMentorUseCase, UnassignInternPlacementMentorUseCase, GetMyInternPlacementUseCase, ListMyMentorPlacementsUseCase,
] as const;

type Method = 'get' | 'post' | 'put' | 'patch';
interface ProtectedRoute {
  method: Method;
  path: string;
  allowed: Role;
  body?: Record<string, unknown>;
}

const protectedRoutes: ProtectedRoute[] = [
  { method: 'get', path: '/applications', allowed: 'HR' },
  { method: 'get', path: '/applications?status=NEW&sort=applicantName&order=asc&search=maya', allowed: 'HR' },
  { method: 'get', path: '/applications/export', allowed: 'HR' },
  { method: 'get', path: `/applications/${UUID}/cv-url`, allowed: 'HR' },
  { method: 'get', path: `/applications/${UUID}`, allowed: 'HR' },
  { method: 'get', path: `/applications/${UUID}/match`, allowed: 'HR' },
  { method: 'post', path: `/applications/${UUID}/match`, allowed: 'HR' },
  { method: 'post', path: `/applications/${UUID}/parse`, allowed: 'HR' },
  { method: 'patch', path: `/applications/${UUID}/status`, allowed: 'HR', body: { status: 'UNDER_REVIEW' } },
  { method: 'get', path: '/hr/dashboard', allowed: 'HR' },
  { method: 'post', path: '/internships', allowed: 'HR', body: { title: 'Engineering' } },
  { method: 'patch', path: `/internships/${UUID}`, allowed: 'HR', body: { title: 'Engineering', isActive: true, capacity: 3, selectionStatus: 'OPEN' } },
  { method: 'get', path: '/internships/manage', allowed: 'HR' },
  { method: 'post', path: `/applications/${UUID}/release-selection`, allowed: 'HR', body: { reason: 'Accepted another offer' } },
  { method: 'get', path: '/admin/settings/application-intake', allowed: 'ADMIN' },
  { method: 'patch', path: '/admin/settings/application-intake', allowed: 'ADMIN', body: { applicationsOpen: false, note: 'Cycle closed' } },
  { method: 'get', path: '/hr/training-planning', allowed: 'HR' },
  { method: 'get', path: '/hr/intern-progress', allowed: 'HR' },
  { method: 'put', path: '/hr/training-planning/requests/mapping', allowed: 'HR', body: { label: 'Robotics', internshipId: OTHER_UUID } },
  { method: 'post', path: '/hr/training-planning/requests/unmap', allowed: 'HR', body: { label: 'Robotics' } },
  { method: 'get', path: `/internships/${UUID}/requirements`, allowed: 'HR' },
  {
    method: 'put', path: `/internships/${UUID}/requirements`, allowed: 'HR',
    body: { requiredSkills: [], preferredSkills: [], languages: [], certifications: [] },
  },
  { method: 'get', path: `/hr/applications/${UUID}/placement`, allowed: 'HR' },
  {
    method: 'post', path: `/hr/applications/${UUID}/placements`, allowed: 'HR',
    body: { company: 'Acme', startDate: '2026-11-01', endDate: '2026-12-01' },
  },
  { method: 'post', path: `/hr/placements/${UUID}/activate`, allowed: 'HR' },
  { method: 'post', path: `/hr/placements/${UUID}/cancel`, allowed: 'HR', body: { reason: 'Applicant withdrew' } },
  { method: 'post', path: `/hr/placements/${UUID}/complete`, allowed: 'HR', body: { note: 'Moved abroad' } },
  { method: 'get', path: '/hr/mentors', allowed: 'HR' },
  { method: 'put', path: `/hr/placements/${UUID}/mentor`, allowed: 'HR', body: { mentorProfileId: OTHER_UUID } },
  { method: 'post', path: `/hr/placements/${UUID}/mentor/unassign`, allowed: 'HR', body: { note: 'On leave' } },
  { method: 'get', path: '/applicant/me', allowed: 'APPLICANT' },
  {
    method: 'patch', path: '/applicant/me', allowed: 'APPLICANT',
    body: {
      fullName: 'Maya', phone: null, location: null, summary: null, education: [], experience: [],
      skills: [], languages: [], certifications: [], links: {},
    },
  },
  { method: 'get', path: '/intern/me/placement', allowed: 'INTERN' },
  { method: 'get', path: '/admin/overview', allowed: 'ADMIN' },
  { method: 'get', path: '/admin/users?role=HR&status=active&search=maya', allowed: 'ADMIN' },
  { method: 'post', path: '/admin/users', allowed: 'ADMIN', body: { email: 'new@example.com', fullName: 'New Mentor', role: 'MENTOR' } },
  { method: 'patch', path: `/admin/users/${UUID}/role`, allowed: 'ADMIN', body: { role: 'HR' } },
  { method: 'patch', path: `/admin/users/${UUID}/status`, allowed: 'ADMIN', body: { active: false, note: 'Left' } },
  { method: 'get', path: '/admin/audit-events?limit=20', allowed: 'ADMIN' },
  { method: 'get', path: '/mentor/placements', allowed: 'MENTOR' },
  { method: 'get', path: `/mentor/placements/${UUID}/weekly-reports`, allowed: 'MENTOR' },
  { method: 'post', path: `/mentor/weekly-reports/${UUID}/review`, allowed: 'MENTOR', body: { decision: 'ACCEPT' } },
  { method: 'get', path: '/intern/me/weekly-reports', allowed: 'INTERN' },
  { method: 'put', path: '/intern/me/weekly-reports/2026-10-05', allowed: 'INTERN', body: { summary: 'Week' } },
  { method: 'post', path: `/intern/me/weekly-reports/${UUID}/submit`, allowed: 'INTERN' },
  { method: 'get', path: '/intern/me/profile', allowed: 'INTERN' },
  { method: 'get', path: `/mentor/placements/${UUID}/evaluations`, allowed: 'MENTOR' },
  { method: 'post', path: `/mentor/placements/${UUID}/evaluations`, allowed: 'MENTOR', body: { content: 'Draft', clientRequestId: OTHER_UUID } },
  { method: 'get', path: `/mentor/evaluations/${UUID}`, allowed: 'MENTOR' },
  { method: 'put', path: `/mentor/evaluations/${UUID}`, allowed: 'MENTOR', body: { content: 'Edited', expectedRevision: 1 } },
  { method: 'post', path: `/mentor/evaluations/${UUID}/publish`, allowed: 'MENTOR', body: { expectedRevision: 2 } },
  { method: 'get', path: '/intern/me/evaluations', allowed: 'INTERN' },
  { method: 'get', path: `/intern/me/evaluations/${UUID}`, allowed: 'INTERN' },
  { method: 'get', path: '/intern/me/certificates', allowed: 'INTERN' },
  { method: 'get', path: `/intern/me/certificates/${UUID}`, allowed: 'INTERN' },
  { method: 'get', path: `/hr/placements/${UUID}/certificates`, allowed: 'HR' },
  { method: 'post', path: `/hr/certificates/${UUID}/reissue`, allowed: 'HR', body: { reason: 'Name corrected' } },
];

describe('HTTP authorization matrix', () => {
  let app: INestApplication;
  const mocks = new Map<unknown, { execute: ReturnType<typeof vi.fn> }>();
  const planningService = {
    getPlan: vi.fn(async () => ({ opportunities: [], unmatchedRequests: [], totals: {} })),
    getRecentEvents: vi.fn(async () => []),
    mapRequest: vi.fn(async () => ({ label: 'x', internshipId: UUID })),
    unmapRequest: vi.fn(async () => ({ label: 'x', internshipId: null })),
  };
  const adminUsers = {
    listUsers: vi.fn(async () => ({ users: [], total: 0 })),
    createStaffUser: vi.fn(async () => ({ id: UUID })),
    changeRole: vi.fn(async () => ({ id: UUID })),
    setActive: vi.fn(async () => ({ user: { id: UUID }, signInBlockSynced: true })),
    listAuditEvents: vi.fn(async () => []),
  };
  const weeklyReports = {
    listForIntern: vi.fn(async () => []),
    saveForIntern: vi.fn(async () => ({ id: UUID })),
    submitForIntern: vi.fn(async () => ({ id: UUID })),
    listForMentorPlacement: vi.fn(async () => []),
    reviewForMentor: vi.fn(async () => ({ id: UUID })),
  };
  const evaluations = {
    listForMentorPlacement: vi.fn(async () => []),
    getForMentor: vi.fn(async () => ({ id: UUID })),
    createForMentor: vi.fn(async () => ({ id: UUID })),
    saveForMentor: vi.fn(async () => ({ id: UUID })),
    publishForMentor: vi.fn(async () => ({ id: UUID })),
    listForIntern: vi.fn(async () => []),
    getForIntern: vi.fn(async () => ({ id: UUID })),
  };
  const certificates = {
    listForIntern: vi.fn(async () => []),
    getForIntern: vi.fn(async () => ({ placementId: UUID })),
    listForHrPlacement: vi.fn(async () => []),
    reissueForHr: vi.fn(async () => ({ id: OTHER_UUID })),
  };
  const adminSettings = {
    getApplicationIntake: vi.fn(async () => ({ applicationsOpen: true, updatedAt: 't', updatedBy: null })),
    setApplicationIntake: vi.fn(async () => ({ applicationsOpen: false, updatedAt: 't', updatedBy: 'Admin' })),
  };
  const adminOverview = { getOverview: vi.fn(async () => ({ users: {}, system: {} })) };
  const requirementsService = {
    getByInternshipId: vi.fn(async () => ({ ok: true })),
    upsert: vi.fn(async () => ({ ok: true })),
  };

  beforeAll(async () => {
    for (const token of useCaseTokens) {
      mocks.set(token, { execute: vi.fn(async () => ({ ok: true })) });
    }
    Object.assign(mocks.get(ListInternshipsUseCase)!, { executeForHr: vi.fn(async () => []) });

    const moduleRef = await Test.createTestingModule({
      controllers: [
        ApplicationsController, ApplicantProfileController, HrDashboardController,
        InternshipsController, InternshipRequirementsController, HrInternPlacementsController,
        InternPlacementController, MentorPlacementsController,
        TrainingPlanningController, AdminController, InternWeeklyReportsController,
        MentorWeeklyReportsController, InternProfileController, HrInternProgressController,
        MentorEvaluationsController, InternEvaluationsController,
        InternCertificatesController, HrCertificatesController,
      ],
      providers: [
        { provide: SupabaseService, useValue: createSupabaseMock() },
        { provide: InternshipRequirementsService, useValue: requirementsService },
        { provide: TrainingPlanningService, useValue: planningService },
        { provide: AdminUsersService, useValue: adminUsers },
        { provide: WeeklyReportRepository, useValue: weeklyReports },
        { provide: EvaluationRepository, useValue: evaluations },
        { provide: CertificateRepository, useValue: certificates },
        { provide: InternProgressService, useValue: { list: vi.fn(async () => []) } },
        { provide: AdminOverviewService, useValue: adminOverview },
        { provide: AdminSettingsService, useValue: adminSettings },
        ...useCaseTokens.map((token) => ({ provide: token, useValue: mocks.get(token) })),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const mock of mocks.values()) mock.execute.mockClear();
    requirementsService.getByInternshipId.mockClear();
    requirementsService.upsert.mockClear();
    for (const fn of Object.values(adminUsers)) fn.mockClear();
    adminOverview.getOverview.mockClear();
    for (const fn of Object.values(weeklyReports)) fn.mockClear();
    for (const fn of Object.values(evaluations)) fn.mockClear();
    for (const fn of Object.values(certificates)) fn.mockClear();
  });

  const send = (route: ProtectedRoute, token?: string) => {
    let req = request(app.getHttpServer())[route.method](route.path);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return route.body ? req.send(route.body) : req;
  };

  describe.each(protectedRoutes)('$method $path ($allowed only)', (route) => {
    it('rejects missing, invalid, and profile-less sessions with 401', async () => {
      await send(route).expect(401);
      await send(route, 'forged-token').expect(401);
      await send(route, 'no-profile-token').expect(401);
    });

    it.each(ROLES.filter((role) => role !== route.allowed))('rejects %s with 403', async (role) => {
      await send(route, tokenFor(role)).expect(403);
    });

    it(`allows ${route.allowed}`, async () => {
      const response = await send(route, tokenFor(route.allowed));
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
    });
  });

  describe('deactivated accounts', () => {
    it('are refused with 403 even on routes their role allows', async () => {
      await send({ method: 'get', path: '/admin/overview', allowed: 'ADMIN' }, 'inactive-admin-token').expect(403);
      await send({ method: 'get', path: '/hr/dashboard', allowed: 'HR' }, 'inactive-hr-token').expect(403);
      expect(adminOverview.getOverview).not.toHaveBeenCalled();
    });

    it('stay refused as deactivated even when password setup is also pending', async () => {
      const response = await send({ method: 'get', path: '/hr/dashboard', allowed: 'HR' }, 'inactive-pending-hr-token').expect(403);
      expect(response.body.message).toBe('This account has been deactivated');
      expect(response.body.code).toBeUndefined();
    });
  });

  describe('password setup pending', () => {
    it.each(protectedRoutes)('$method $path refuses its own role until a password is set', async (route) => {
      const response = await send(route, pendingTokenFor(route.allowed)).expect(403);
      expect(response.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PASSWORD_SETUP_REQUIRED',
        message: 'Set a password before using the portal.',
      });
    });

    it('never reaches the handlers for a pending user', async () => {
      for (const mock of mocks.values()) mock.execute.mockClear();
      for (const route of protectedRoutes) await send(route, pendingTokenFor(route.allowed));
      for (const mock of mocks.values()) expect(mock.execute).not.toHaveBeenCalled();
      expect(adminOverview.getOverview).not.toHaveBeenCalled();
    });

    it('a missing setup flag does not grant access: unauthenticated and forged sessions still get 401', async () => {
      await send({ method: 'get', path: '/hr/dashboard', allowed: 'HR' }).expect(401);
      await send({ method: 'get', path: '/hr/dashboard', allowed: 'HR' }, 'forged-token').expect(401);
    });
  });

  describe('retired task routes', () => {
    it.each([
      ['get', '/intern/me/tasks', 'INTERN'],
      ['patch', `/intern/me/tasks/${UUID}/status`, 'INTERN'],
      ['post', `/intern/me/tasks/${UUID}/withdraw`, 'INTERN'],
      ['get', `/mentor/placements/${UUID}/tasks`, 'MENTOR'],
      ['post', `/mentor/placements/${UUID}/tasks`, 'MENTOR'],
      ['get', `/mentor/placements/${UUID}/task-events`, 'MENTOR'],
      ['patch', `/mentor/tasks/${UUID}`, 'MENTOR'],
      ['post', `/mentor/tasks/${UUID}/cancel`, 'MENTOR'],
      ['post', `/mentor/tasks/${UUID}/review`, 'MENTOR'],
    ] as const)('%s %s no longer exists', async (method, path, role) => {
      await request(app.getHttpServer())[method](path)
        .set('Authorization', `Bearer ${tokenFor(role)}`)
        .expect(404);
    });
  });

  describe('weekly report requests', () => {
    it('save only the token owner\'s report and validate the week', async () => {
      await send(
        { method: 'put', path: '/intern/me/weekly-reports/2026-10-05', allowed: 'INTERN',
          body: { summary: '  Built the API ', learnings: '', authUserId: OTHER_UUID } },
        tokenFor('INTERN'),
      ).expect(200);
      expect(weeklyReports.saveForIntern).toHaveBeenCalledWith(idFor('INTERN'), '2026-10-05', {
        summary: 'Built the API', learnings: null, challenges: null, nextWeekPlan: null,
      });
      await send({ method: 'put', path: '/intern/me/weekly-reports/2026-13-40', allowed: 'INTERN', body: {} }, tokenFor('INTERN')).expect(400);
      await send({ method: 'put', path: '/intern/me/weekly-reports/next-week', allowed: 'INTERN', body: {} }, tokenFor('INTERN')).expect(400);
      expect(weeklyReports.saveForIntern).toHaveBeenCalledTimes(1);
    });

    it('take the reviewing Mentor from the token and validate the decision', async () => {
      await send(
        { method: 'post', path: `/mentor/weekly-reports/${UUID}/review`, allowed: 'MENTOR', body: { decision: 'RETURN', feedback: ' More detail ' } },
        tokenFor('MENTOR'),
      ).expect(201);
      expect(weeklyReports.reviewForMentor).toHaveBeenCalledWith(idFor('MENTOR'), UUID, 'RETURN', 'More detail');
      await send({ method: 'post', path: `/mentor/weekly-reports/${UUID}/review`, allowed: 'MENTOR', body: { decision: 'REJECT' } }, tokenFor('MENTOR')).expect(400);
    });
  });

  describe('evaluation requests', () => {
    it('never reach the evaluation repository for HR, ADMIN, APPLICANT or a pending user', async () => {
      const evaluationRoutes = protectedRoutes.filter((route) => route.path.includes('/evaluations'));
      expect(evaluationRoutes).toHaveLength(7);
      for (const route of evaluationRoutes) {
        for (const role of ['HR', 'ADMIN', 'APPLICANT'] as const) {
          await send(route, tokenFor(role)).expect(403);
        }
        await send(route, pendingTokenFor(route.allowed)).expect(403);
      }
      for (const fn of Object.values(evaluations)) expect(fn).not.toHaveBeenCalled();
    });

    it('pass the Mentor from the token and the text exactly as sent', async () => {
      const text = '  Línea\r\nسطر 😀\t ';
      await send({ method: 'post', path: `/mentor/placements/${UUID}/evaluations`, allowed: 'MENTOR',
        body: { content: text, clientRequestId: OTHER_UUID } }, tokenFor('MENTOR')).expect(201);
      expect(evaluations.createForMentor).toHaveBeenCalledWith(idFor('MENTOR'), UUID, OTHER_UUID, text);
      await send({ method: 'put', path: `/mentor/evaluations/${UUID}`, allowed: 'MENTOR', body: { content: text, expectedRevision: 4 } },
        tokenFor('MENTOR')).expect(200);
      expect(evaluations.saveForMentor).toHaveBeenCalledWith(idFor('MENTOR'), UUID, 4, text);
      await send({ method: 'post', path: `/mentor/evaluations/${UUID}/publish`, allowed: 'MENTOR', body: { expectedRevision: 5 } },
        tokenFor('MENTOR')).expect(200);
      expect(evaluations.publishForMentor).toHaveBeenCalledWith(idFor('MENTOR'), UUID, 5);
    });

    it('refuse client-supplied identity, state or snapshot fields instead of ignoring them', async () => {
      for (const body of [
        { content: 'x', clientRequestId: OTHER_UUID, mentorProfileId: OTHER_UUID },
        { content: 'x', clientRequestId: OTHER_UUID, authorProfileId: OTHER_UUID },
        { content: 'x', clientRequestId: OTHER_UUID, status: 'PUBLISHED' },
      ]) {
        const response = await send({ method: 'post', path: `/mentor/placements/${UUID}/evaluations`, allowed: 'MENTOR', body },
          tokenFor('MENTOR')).expect(400);
        expect(response.body.code).toBe('VALIDATION_FAILED');
      }
      const publish = await send({ method: 'post', path: `/mentor/evaluations/${UUID}/publish`, allowed: 'MENTOR',
        body: { expectedRevision: 2, content: 'publish this instead' } }, tokenFor('MENTOR')).expect(400);
      expect(publish.body.code).toBe('VALIDATION_FAILED');
      expect(evaluations.createForMentor).not.toHaveBeenCalled();
      expect(evaluations.publishForMentor).not.toHaveBeenCalled();
    });

    it('validate ids, revisions and the code-point limit before any database call', async () => {
      await send({ method: 'get', path: '/mentor/evaluations/not-a-uuid', allowed: 'MENTOR' }, tokenFor('MENTOR')).expect(400);
      await send({ method: 'get', path: '/intern/me/evaluations/not-a-uuid', allowed: 'INTERN' }, tokenFor('INTERN')).expect(400);
      const noRevision = await send({ method: 'put', path: `/mentor/evaluations/${UUID}`, allowed: 'MENTOR', body: { content: 'x' } },
        tokenFor('MENTOR')).expect(400);
      expect(noRevision.body.code).toBe('VALIDATION_FAILED');
      const tooLong = await send({ method: 'post', path: `/mentor/placements/${UUID}/evaluations`, allowed: 'MENTOR',
        body: { content: 'a'.repeat(40_001), clientRequestId: OTHER_UUID } }, tokenFor('MENTOR')).expect(400);
      expect(tooLong.body.code).toBe('EVALUATION_CONTENT_TOO_LONG');
      for (const clientRequestId of [undefined, 'not-a-uuid']) {
        const noKey = await send({ method: 'post', path: `/mentor/placements/${UUID}/evaluations`, allowed: 'MENTOR',
          body: { content: 'x', clientRequestId } }, tokenFor('MENTOR')).expect(400);
        expect(noKey.body.code).toBe('VALIDATION_FAILED');
      }
      expect(evaluations.getForMentor).not.toHaveBeenCalled();
      expect(evaluations.saveForMentor).not.toHaveBeenCalled();
      expect(evaluations.createForMentor).not.toHaveBeenCalled();
    });

    it('mark evaluation responses as not cacheable', async () => {
      const mentor = await send({ method: 'get', path: `/mentor/evaluations/${UUID}`, allowed: 'MENTOR' }, tokenFor('MENTOR')).expect(200);
      expect(mentor.headers['cache-control']).toBe('no-store');
      const intern = await send({ method: 'get', path: '/intern/me/evaluations', allowed: 'INTERN' }, tokenFor('INTERN')).expect(200);
      expect(intern.headers['cache-control']).toBe('no-store');
      expect(evaluations.listForIntern).toHaveBeenCalledWith(idFor('INTERN'));
    });
  });

  describe('certificate requests', () => {
    const certificateRoutes = () => protectedRoutes.filter((route) => route.path.includes('certificates'));

    it('never reach the certificate repository for other roles, pending users or missing sessions', async () => {
      expect(certificateRoutes()).toHaveLength(4);
      for (const route of certificateRoutes()) {
        for (const role of ROLES.filter((candidate) => candidate !== route.allowed)) {
          await send(route, tokenFor(role)).expect(403);
        }
        await send(route, pendingTokenFor(route.allowed)).expect(403);
        await send(route, 'inactive-hr-token').expect(403);
        await send(route).expect(401);
      }
      for (const fn of Object.values(certificates)) expect(fn).not.toHaveBeenCalled();
    });

    it('read the intern\'s own certificates by placement, with the intern from the token', async () => {
      const list = await send({ method: 'get', path: `/intern/me/certificates?authUserId=${OTHER_UUID}`, allowed: 'INTERN' },
        tokenFor('INTERN')).expect(200);
      expect(certificates.listForIntern).toHaveBeenCalledWith(idFor('INTERN'));
      expect(list.headers['cache-control']).toBe('no-store');
      const one = await send({ method: 'get', path: `/intern/me/certificates/${UUID}`, allowed: 'INTERN' }, tokenFor('INTERN')).expect(200);
      expect(certificates.getForIntern).toHaveBeenCalledWith(idFor('INTERN'), UUID);
      expect(one.headers['cache-control']).toBe('no-store');
      expect(one.body).toEqual({ placementId: UUID });
    });

    it('return the intern view without an id, reason, history or number', async () => {
      const view = {
        placementId: UUID, certificateTitle: 'Certificate of Completion', issuerName: 'Progineer Technologies',
        recipientName: 'Intern', trainingTitle: 'Engineering', completionDate: '2026-03-11', issuedAt: '2026-03-10T22:30:05Z',
      };
      certificates.listForIntern.mockResolvedValueOnce([view] as never);
      const response = await send({ method: 'get', path: '/intern/me/certificates', allowed: 'INTERN' }, tokenFor('INTERN')).expect(200);
      expect(response.body).toEqual([view]);
      expect(Object.keys(response.body[0])).not.toEqual(expect.arrayContaining(['id']));
      expect(JSON.stringify(response.body)).not.toMatch(/"(id|certificateId|status|reissueReason|supersedesCertificateId|certificateNumber)"/);
    });

    it('list a placement\'s history and reissue with the HR user from the token', async () => {
      const list = await send({ method: 'get', path: `/hr/placements/${UUID}/certificates`, allowed: 'HR' }, tokenFor('HR')).expect(200);
      expect(certificates.listForHrPlacement).toHaveBeenCalledWith(idFor('HR'), UUID);
      expect(list.headers['cache-control']).toBe('no-store');
      const reissue = await send({ method: 'post', path: `/hr/certificates/${UUID}/reissue`, allowed: 'HR', body: { reason: '  Name corrected  ' } },
        tokenFor('HR')).expect(201);
      expect(certificates.reissueForHr).toHaveBeenCalledWith(idFor('HR'), UUID, 'Name corrected');
      expect(reissue.headers['cache-control']).toBe('no-store');
    });

    it('validate the reissue reason before any database call', async () => {
      const cases: Array<[Record<string, unknown> | undefined, string]> = [
        [undefined, 'REISSUE_REASON_REQUIRED'],
        [{}, 'REISSUE_REASON_REQUIRED'],
        [{ reason: '' }, 'REISSUE_REASON_REQUIRED'],
        [{ reason: '   ' }, 'REISSUE_REASON_REQUIRED'],
        [{ reason: 'x'.repeat(1001) }, 'REISSUE_REASON_TOO_LONG'],
        [{ reason: 42 }, 'VALIDATION_FAILED'],
        [{ reason: 'Fix', actorProfileId: OTHER_UUID }, 'VALIDATION_FAILED'],
        [{ reason: 'Fix', role: 'HR' }, 'VALIDATION_FAILED'],
        [{ reason: 'Fix', placementId: OTHER_UUID }, 'VALIDATION_FAILED'],
      ];
      for (const [body, code] of cases) {
        const response = await send({ method: 'post', path: `/hr/certificates/${UUID}/reissue`, allowed: 'HR', body },
          tokenFor('HR')).expect(400);
        expect(response.body.code).toBe(code);
      }
      await send({ method: 'post', path: `/hr/certificates/${UUID}/reissue`, allowed: 'HR', body: { reason: 'x'.repeat(1000) } },
        tokenFor('HR')).expect(201);
      expect(certificates.reissueForHr).toHaveBeenCalledTimes(1);
    });

    it('validate ids before any database call', async () => {
      await send({ method: 'get', path: '/intern/me/certificates/not-a-uuid', allowed: 'INTERN' }, tokenFor('INTERN')).expect(400);
      await send({ method: 'get', path: '/hr/placements/not-a-uuid/certificates', allowed: 'HR' }, tokenFor('HR')).expect(400);
      await send({ method: 'post', path: '/hr/certificates/not-a-uuid/reissue', allowed: 'HR', body: { reason: 'Fix' } }, tokenFor('HR')).expect(400);
      for (const fn of Object.values(certificates)) expect(fn).not.toHaveBeenCalled();
    });

    it('offer no other certificate routes (no issue, edit or delete; no Mentor or ADMIN access)', async () => {
      for (const [method, path, role] of [
        ['post', `/hr/placements/${UUID}/certificates`, 'HR'],
        ['patch', `/hr/certificates/${UUID}`, 'HR'],
        ['delete', `/hr/certificates/${UUID}`, 'HR'],
        ['get', `/hr/certificates/${UUID}`, 'HR'],
        ['get', `/mentor/placements/${UUID}/certificates`, 'MENTOR'],
        ['get', '/admin/certificates', 'ADMIN'],
      ] as const) {
        await request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${tokenFor(role)}`).expect(404);
      }
      for (const fn of Object.values(certificates)) expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('CV duplicate check', () => {
    it('is public, answers 200 from the shared rule, and validates its input', async () => {
      const execute = mocks.get(CheckCvDuplicateUseCase)!.execute;
      execute.mockResolvedValueOnce({ duplicate: false, previouslyUploaded: true });
      const response = await request(app.getHttpServer())
        .post('/applications/cv-check')
        .send({ cvSha256: 'a'.repeat(64), internshipId: UUID })
        .expect(200);
      expect(response.body).toEqual({ duplicate: false, previouslyUploaded: true });
      expect(execute).toHaveBeenCalledWith('a'.repeat(64), UUID, null);

      // A CV can be checked before a training is chosen.
      execute.mockResolvedValueOnce({ duplicate: null, previouslyUploaded: false });
      await request(app.getHttpServer()).post('/applications/cv-check').send({ cvSha256: 'b'.repeat(64) }).expect(200);
      expect(execute).toHaveBeenLastCalledWith('b'.repeat(64), null, null);

      await request(app.getHttpServer()).post('/applications/cv-check').send({ cvSha256: 'not-a-hash', internshipId: UUID }).expect(400);
      await request(app.getHttpServer()).post('/applications/cv-check').send({ cvSha256: 'a'.repeat(64), internshipId: 'nope' }).expect(400);
      expect(execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('one application per applicant', () => {
    it('answers eligibility for the signed-in user of any role, from their own session only', async () => {
      const execute = mocks.get(GetApplicantEligibilityUseCase)!.execute;
      execute.mockResolvedValue({ canApply: false });
      await request(app.getHttpServer()).get('/applications/eligibility').expect(401);
      expect(execute).not.toHaveBeenCalled();
      for (const role of ['APPLICANT', 'INTERN'] as const) {
        const response = await request(app.getHttpServer())
          .get(`/applications/eligibility?authUserId=${OTHER_UUID}`)
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .expect(200);
        expect(response.body).toEqual({ canApply: false });
        expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ id: idFor(role) }));
      }
    });

    it('passes a signed-in caller\'s session to the CV upload so the rule is checked for that account', async () => {
      const execute = mocks.get(SubmitApplicationUseCase)!.execute;
      execute.mockResolvedValue({ applicationId: 'a', status: 'DRAFT', message: 'ok' });
      await request(app.getHttpServer())
        .post('/applications/submit')
        .set('Authorization', `Bearer ${tokenFor('INTERN')}`)
        .field('internshipId', UUID)
        .attach('cv', Buffer.from('%PDF-1.4'), { filename: 'cv.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(execute).toHaveBeenLastCalledWith(UUID, null, expect.anything(), tokenFor('INTERN'));

      await request(app.getHttpServer())
        .post('/applications/submit')
        .field('internshipId', UUID)
        .attach('cv', Buffer.from('%PDF-1.4'), { filename: 'cv.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(execute).toHaveBeenLastCalledWith(UUID, null, expect.anything(), null);
    });
  });

  describe('application intake and selection release', () => {
    it('exposes intake status publicly, without authentication', async () => {
      await send({ method: 'get', path: '/applications/intake', allowed: 'APPLICANT' }).expect(200);
      expect(mocks.get(GetApplicationIntakeUseCase)!.execute).toHaveBeenCalled();
    });

    it('lets only ADMIN change intake, taking the actor from the token', async () => {
      await send(
        { method: 'patch', path: '/admin/settings/application-intake', allowed: 'ADMIN',
          body: { applicationsOpen: false, note: '  Cycle closed ', actorProfileId: OTHER_UUID } },
        tokenFor('ADMIN'),
      ).expect(200);
      expect(adminSettings.setApplicationIntake).toHaveBeenCalledWith(idFor('ADMIN'), false, 'Cycle closed');
      await send({ method: 'patch', path: '/admin/settings/application-intake', allowed: 'ADMIN', body: { applicationsOpen: 'no' } }, tokenFor('ADMIN')).expect(400);
    });

    it('releases a selection with the HR actor from the token and requires a reason', async () => {
      await send(
        { method: 'post', path: `/applications/${UUID}/release-selection`, allowed: 'HR', body: { reason: ' Declined offer ', actorProfileId: OTHER_UUID } },
        tokenFor('HR'),
      ).expect(201);
      expect(mocks.get(ReleaseApplicationSelectionUseCase)!.execute).toHaveBeenCalledWith(idFor('HR'), UUID, 'Declined offer');
      await send({ method: 'post', path: `/applications/${UUID}/release-selection`, allowed: 'HR', body: { reason: '  ' } }, tokenFor('HR')).expect(400);
      await send({ method: 'post', path: '/applications/not-a-uuid/release-selection', allowed: 'HR', body: { reason: 'x' } }, tokenFor('HR')).expect(400);
    });

    it('requires a valid selection status when HR updates an opportunity', async () => {
      await send({ method: 'patch', path: `/internships/${UUID}`, allowed: 'HR', body: { title: 'E', isActive: true, capacity: 3, selectionStatus: 'APPROVED' } }, tokenFor('HR')).expect(400);
      await send({ method: 'post', path: '/internships', allowed: 'HR', body: { title: 'E', selectionStatus: 'CLOSED' } }, tokenFor('HR')).expect(400);
    });

    it('creates an opportunity from its title alone; there is no separate internship type', async () => {
      await send({ method: 'post', path: '/internships', allowed: 'HR', body: { title: ' E ', internshipType: 'Other' } }, tokenFor('HR')).expect(201);
      const command = mocks.get(CreateInternshipUseCase)!.execute.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(command).toMatchObject({ actorProfileId: idFor('HR'), title: 'E' });
      expect(command).not.toHaveProperty('internshipType');
    });
  });

  describe('admin requests', () => {
    it('take the acting admin from the token and drop client-supplied identity fields', async () => {
      await send(
        { method: 'patch', path: `/admin/users/${UUID}/role`, allowed: 'ADMIN',
          body: { role: 'ADMIN', actorProfileId: OTHER_UUID, note: '  Promotion  ' } },
        tokenFor('ADMIN'),
      ).expect(200);
      expect(adminUsers.changeRole).toHaveBeenCalledWith(idFor('ADMIN'), UUID, 'ADMIN', 'Promotion');
    });

    it('cannot create applicant or intern accounts', async () => {
      for (const role of ['APPLICANT', 'INTERN']) {
        await send(
          { method: 'post', path: '/admin/users', allowed: 'ADMIN', body: { email: 'x@example.com', fullName: 'X', role } },
          tokenFor('ADMIN'),
        ).expect(400);
      }
      expect(adminUsers.createStaffUser).not.toHaveBeenCalled();
    });

    it('normalizes the new account email and rejects invalid input', async () => {
      await send(
        { method: 'post', path: '/admin/users', allowed: 'ADMIN', body: { email: '  New@Example.COM ', fullName: ' Maya ', role: 'HR' } },
        tokenFor('ADMIN'),
      ).expect(201);
      expect(adminUsers.createStaffUser).toHaveBeenCalledWith(idFor('ADMIN'), { email: 'new@example.com', fullName: 'Maya', role: 'HR' });
      await send(
        { method: 'post', path: '/admin/users', allowed: 'ADMIN', body: { email: 'not-an-email', fullName: 'X', role: 'HR' } },
        tokenFor('ADMIN'),
      ).expect(400);
      await send({ method: 'patch', path: '/admin/users/not-a-uuid/status', allowed: 'ADMIN', body: { active: true } }, tokenFor('ADMIN')).expect(400);
      await send({ method: 'patch', path: `/admin/users/${UUID}/status`, allowed: 'ADMIN', body: { active: 'no' } }, tokenFor('ADMIN')).expect(400);
    });
  });

  describe('identity is derived from the verified session, never from the request', () => {
    it('loads the applicant profile for the token owner', async () => {
      await send({ method: 'get', path: '/applicant/me', allowed: 'APPLICANT' }, tokenFor('APPLICANT')).expect(200);
      expect(mocks.get(GetApplicantProfileUseCase)!.execute).toHaveBeenCalledWith(idFor('APPLICANT'));
    });

    it('records the HR actor from the token and strips client-supplied actor fields', async () => {
      await send(
        { method: 'patch', path: `/applications/${UUID}/status`, allowed: 'HR',
          body: { status: 'UNDER_REVIEW', actorProfileId: OTHER_UUID, role: 'ADMIN' } },
        tokenFor('HR'),
      ).expect(200);
      expect(mocks.get(UpdateApplicationStatusUseCase)!.execute)
        .toHaveBeenCalledWith({ actorProfileId: idFor('HR'), applicationId: UUID, status: 'UNDER_REVIEW', reason: null, note: null });
    });

    it('lists Mentor placements for the token owner only', async () => {
      await send({ method: 'get', path: `/mentor/placements?mentorProfileId=${OTHER_UUID}`, allowed: 'MENTOR' }, tokenFor('MENTOR')).expect(200);
      expect(mocks.get(ListMyMentorPlacementsUseCase)!.execute).toHaveBeenCalledWith(idFor('MENTOR'));
    });
  });

  describe('input validation on authorized HR routes', () => {
    it.each([
      ['get', '/applications/not-a-uuid'],
      ['get', '/applications/not-a-uuid/cv-url'],
      ['patch', '/applications/not-a-uuid/status'],
      ['post', '/applications/not-a-uuid/match'],
      ['post', '/applications/not-a-uuid/parse'],
      ['get', '/internships/not-a-uuid/requirements'],
    ] as const)('rejects a malformed id on %s %s with 400 before reaching the use case', async (method, path) => {
      await request(app.getHttpServer())[method](path)
        .set('Authorization', `Bearer ${tokenFor('HR')}`)
        .expect(400);
      for (const mock of mocks.values()) expect(mock.execute).not.toHaveBeenCalled();
      expect(requirementsService.getByInternshipId).not.toHaveBeenCalled();
    });
  });

  describe('removed legacy routes', () => {
    it('no longer exposes the applicant direct-create route that bypassed CV review', async () => {
      await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${tokenFor('APPLICANT')}`)
        .send({ applicantName: 'X', applicantEmail: 'x@example.com', internshipId: UUID, cvUrl: 'https://evil.example/cv' })
        .expect(404);
    });

    it('no longer exposes the anonymous upload-cv route', async () => {
      await request(app.getHttpServer())
        .post('/applications/upload-cv')
        .field('internshipId', UUID)
        .expect(404);
    });
  });

  describe('HR list and export', () => {
    it('passes the same validated filters to the list and the export', async () => {
      const listMock = mocks.get(ListApplicationsUseCase)!.execute;
      const exportMock = mocks.get(ExportApplicationsUseCase)!.execute;
      exportMock.mockResolvedValueOnce('\uFEFFApplication ID\r\n');

      await request(app.getHttpServer())
        .get('/applications?status=SHORTLISTED&search=maya&sort=status&order=asc&cvPath=x')
        .set('Authorization', `Bearer ${tokenFor('HR')}`)
        .expect(200);
      const exportResponse = await request(app.getHttpServer())
        .get('/applications/export?status=SHORTLISTED&search=maya&sort=status&order=asc')
        .set('Authorization', `Bearer ${tokenFor('HR')}`)
        .expect(200);

      const expected = { status: 'SHORTLISTED', search: 'maya', sort: 'status', order: 'asc' };
      expect(listMock).toHaveBeenCalledWith(expect.objectContaining(expected));
      expect(listMock.mock.calls[0][0]).not.toHaveProperty('cvPath');
      expect(exportMock).toHaveBeenCalledWith(expect.objectContaining(expected));
      expect(exportResponse.headers['content-type']).toContain('text/csv');
      expect(exportResponse.headers['content-disposition']).toMatch(/^attachment; filename="applications-\d{4}-\d{2}-\d{2}\.csv"$/);
      expect(exportResponse.headers['cache-control']).toBe('no-store');
    });

    it('rejects a DRAFT filter and unknown sort fields', async () => {
      for (const query of ['status=DRAFT', 'sort=cv_path']) {
        await request(app.getHttpServer())
          .get(`/applications?${query}`)
          .set('Authorization', `Bearer ${tokenFor('HR')}`)
          .expect(400);
      }
    });
  });

  describe('applicant self-service', () => {
    it('edits only the token owner\'s profile and ignores client-supplied identity', async () => {
      await request(app.getHttpServer())
        .patch('/applicant/me')
        .set('Authorization', `Bearer ${tokenFor('APPLICANT')}`)
        .send({
          fullName: 'Maya', email: 'other@example.com', role: 'HR', authUserId: OTHER_UUID,
          phone: null, location: null, summary: null, education: [], experience: [],
          skills: [], languages: [], certifications: [], links: {},
        })
        .expect(200);
      const [userId, dto] = mocks.get(UpdateApplicantProfileUseCase)!.execute.mock.calls[0];
      expect(userId).toBe(idFor('APPLICANT'));
      expect(dto).not.toHaveProperty('email');
      expect(dto).not.toHaveProperty('role');
      expect(dto).not.toHaveProperty('authUserId');
    });
  });

  describe('intentionally public routes', () => {
    it('lists internships without a session', async () => {
      await request(app.getHttpServer()).get('/internships').expect(200);
    });

    it('loads a review by token without a session', async () => {
      await request(app.getHttpServer()).get(`/applications/review/${REVIEW_TOKEN}`).expect(200);
      expect(mocks.get(GetApplicationReviewUseCase)!.execute).toHaveBeenCalledWith(REVIEW_TOKEN);
    });

    const reviewBody = {
      fullName: 'Applicant', email: 'applicant@example.com', phone: null, location: null, summary: null,
      education: [], experience: [], skills: [], languages: [], certifications: [], links: {},
    };

    it('submits a review without a session as an anonymous caller', async () => {
      await request(app.getHttpServer())
        .post(`/applications/review/${REVIEW_TOKEN}/submit`)
        .send(reviewBody)
        .expect(201);
      expect(mocks.get(SubmitReviewedApplicationUseCase)!.execute)
        .toHaveBeenCalledWith(REVIEW_TOKEN, expect.objectContaining({ email: 'applicant@example.com' }), null);
    });

    it('passes a signed-in caller session to the review submission', async () => {
      await request(app.getHttpServer())
        .post(`/applications/review/${REVIEW_TOKEN}/submit`)
        .set('Authorization', `Bearer ${tokenFor('APPLICANT')}`)
        .send(reviewBody)
        .expect(201);
      expect(mocks.get(SubmitReviewedApplicationUseCase)!.execute)
        .toHaveBeenCalledWith(REVIEW_TOKEN, expect.any(Object), tokenFor('APPLICANT'));
    });

    it('rejects a malformed Authorization header on the review submission', async () => {
      await request(app.getHttpServer())
        .post(`/applications/review/${REVIEW_TOKEN}/submit`)
        .set('Authorization', 'Basic abc')
        .send(reviewBody)
        .expect(401);
      expect(mocks.get(SubmitReviewedApplicationUseCase)!.execute).not.toHaveBeenCalled();
    });
  });
});
