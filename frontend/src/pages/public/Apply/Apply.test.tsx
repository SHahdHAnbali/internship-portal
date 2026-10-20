// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => {
  class ReviewSubmissionError extends Error {
    readonly code: string | null;
    constructor(message: string, code: string | null) { super(message); this.code = code; }
  }
  return {
    ReviewSubmissionError,
    getApplicationIntake: vi.fn(),
    getApplicationEligibility: vi.fn(),
    submitApplication: vi.fn(),
    checkCvDuplicate: vi.fn(),
    getInternships: vi.fn(),
  };
});
const hashing = vi.hoisted(() => ({ sha256Hex: vi.fn() }));
const auth = vi.hoisted(() => ({
  value: { user: null as { id: string } | null, role: null as string | null, loading: false },
}));
vi.mock('@/features/applications/services/applications.service', () => ({
  PREVIOUS_APPLICATION_EXISTS: 'PREVIOUS_APPLICATION_EXISTS',
  ReviewSubmissionError: api.ReviewSubmissionError,
  getApplicationIntake: api.getApplicationIntake,
  getApplicationEligibility: api.getApplicationEligibility,
  submitApplication: api.submitApplication,
  checkCvDuplicate: api.checkCvDuplicate,
}));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => auth.value }));
vi.mock('@/features/internships/services/internships.service', () => ({ getInternships: api.getInternships }));
vi.mock('@/features/applications/cv-hash', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/applications/cv-hash')>()),
  sha256Hex: hashing.sha256Hex,
}));

import { CvHashUnavailableError } from '@/features/applications/cv-hash';

import Apply from './Apply';

const HASH = 'a'.repeat(64);

function renderApply() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><Apply /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openForm() {
  const view = renderApply();
  await screen.findByText('Start your application');
  return view;
}

function selectTraining(value: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } });
}

function chooseCv(container: HTMLElement, name = 'cv.pdf') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], name, { type: 'application/pdf' })] } });
}

const submitButton = () => screen.getByRole('button', { name: /submit application/i }) as HTMLButtonElement;

describe('Apply page and portal intake', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows a closed message and no form while applications are closed, with a way back to the website', async () => {
    api.getInternships.mockResolvedValue([{ id: 'i', title: 'Backend', isActive: true, createdAt: 'c' }]);
    api.getApplicationIntake.mockResolvedValue({ applicationsOpen: false });
    renderApply();
    expect(await screen.findByText('Applications are currently closed')).toBeTruthy();
    expect(screen.queryByText('Backend')).toBeNull();
    expect(api.submitApplication).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /back to website/i }).getAttribute('href')).toBe('/');
  });

  it('shows the form, including the "Other" option, while applications are open', async () => {
    api.getInternships.mockResolvedValue([{ id: 'i', title: 'Backend', isActive: true, createdAt: 'c' }]);
    api.getApplicationIntake.mockResolvedValue({ applicationsOpen: true });
    renderApply();
    expect(await screen.findByText('Backend')).toBeTruthy();
    expect(screen.queryByText('Applications are currently closed')).toBeNull();
  });
});

describe('Apply page: "Back to website"', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('links the application page back to the public home page', async () => {
    api.getInternships.mockResolvedValue([]);
    api.getApplicationIntake.mockResolvedValue({ applicationsOpen: true });
    await openForm();
    expect(screen.getByRole('link', { name: /back to website/i }).getAttribute('href')).toBe('/');
  });
});

describe('Apply page: CV check before submitting', () => {
  beforeEach(() => {
    api.getInternships.mockResolvedValue([
      { id: 'i1', title: 'Backend', isActive: true, createdAt: 'c' },
      { id: 'i2', title: 'Frontend Developer', isActive: true, createdAt: 'c' },
    ]);
    api.getApplicationIntake.mockResolvedValue({ applicationsOpen: true });
    hashing.sha256Hex.mockResolvedValue(HASH);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('checks as soon as a CV is selected, before a training is chosen, and confirms a genuinely new CV', async () => {
    api.checkCvDuplicate.mockResolvedValue({ duplicate: null, previouslyUploaded: false });
    const { container } = await openForm();
    chooseCv(container);

    expect(await screen.findByText('No previous upload of this CV was found.')).toBeTruthy();
    expect(api.checkCvDuplicate).toHaveBeenCalledWith(HASH, null, null);
    // Still needs a training before it can be submitted.
    expect(submitButton().disabled).toBe(true);
  });

  it('only warns about a CV that was uploaded before but never submitted, without blocking the submission', async () => {
    api.checkCvDuplicate.mockResolvedValue({ duplicate: false, previouslyUploaded: true });
    api.submitApplication.mockResolvedValue({ applicationId: 'a', status: 'DRAFT', message: 'ok' });
    const { container } = await openForm();
    selectTraining('i2');
    chooseCv(container);

    const warning = await screen.findByRole('alert');
    expect(warning.textContent).toMatch(/matches a file that was uploaded before/);
    expect(warning.textContent).not.toMatch(/already been submitted/);
    // Nothing about the other applicant or their application is shown.
    expect(warning.textContent).not.toMatch(/Backend|@|applicant [A-Z]/);
    expect(api.checkCvDuplicate).toHaveBeenCalledWith(HASH, 'i2', null);
    expect(submitButton().disabled).toBe(false);
    fireEvent.click(submitButton());
    await waitFor(() => expect(api.submitApplication).toHaveBeenCalledTimes(1));
  });

  it('blocks a CV that was already submitted (the CV rule)', async () => {
    api.checkCvDuplicate.mockResolvedValue({ duplicate: true, previouslyUploaded: true });
    const { container } = await openForm();
    selectTraining('i1');
    chooseCv(container);

    expect((await screen.findByRole('alert')).textContent).toMatch(/This CV has already been submitted\./);
    expect(submitButton().disabled).toBe(true);
    fireEvent.submit(submitButton().closest('form') as HTMLFormElement);
    expect(api.submitApplication).not.toHaveBeenCalled();
  });

  it('shows a loading state and keeps submitting disabled while checking', async () => {
    let answer: (value: { duplicate: boolean; previouslyUploaded: boolean }) => void = () => undefined;
    api.checkCvDuplicate.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    api.submitApplication.mockResolvedValue({ applicationId: 'a', status: 'DRAFT', message: 'ok' });
    const { container } = await openForm();
    selectTraining('i1');
    chooseCv(container);

    expect(await screen.findByText('Checking this CV against previous uploads...')).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
    await act(async () => { answer({ duplicate: false, previouslyUploaded: false }); });
    expect(await screen.findByText('No previous upload of this CV was found.')).toBeTruthy();
    expect(submitButton().disabled).toBe(false);

    fireEvent.click(submitButton());
    await waitFor(() => expect(api.submitApplication).toHaveBeenCalledTimes(1));
    expect(api.submitApplication.mock.calls[0].slice(0, 2)).toEqual(['i1', null]);
  });

  it('never treats a failed check as clear: submitting stays disabled until a retry succeeds', async () => {
    api.checkCvDuplicate.mockRejectedValueOnce(new Error('Network down')).mockResolvedValueOnce({ duplicate: false, previouslyUploaded: false });
    const { container } = await openForm();
    selectTraining('i1');
    chooseCv(container);

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not check this CV against previous uploads/);
    expect(screen.queryByText('No previous upload of this CV was found.')).toBeNull();
    expect(submitButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No previous upload of this CV was found.')).toBeTruthy();
    expect(submitButton().disabled).toBe(false);
    expect(api.checkCvDuplicate).toHaveBeenCalledTimes(2);
  });

  it('when the browser cannot hash files, says the CV is checked on submit and lets the server decide', async () => {
    hashing.sha256Hex.mockRejectedValue(new CvHashUnavailableError());
    const { container } = await openForm();
    selectTraining('i1');
    chooseCv(container);

    expect(await screen.findByText(/cannot be checked in advance/)).toBeTruthy();
    expect(api.checkCvDuplicate).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(false);
  });

  it('asks again only when the CV or the training changes (repeated checks are answered from cache)', async () => {
    api.checkCvDuplicate.mockResolvedValue({ duplicate: false, previouslyUploaded: false });
    const { container } = await openForm();
    selectTraining('i1');
    chooseCv(container);
    await screen.findByText('No previous upload of this CV was found.');
    expect(api.checkCvDuplicate).toHaveBeenCalledTimes(1);

    selectTraining('i2');
    await waitFor(() => expect(api.checkCvDuplicate).toHaveBeenCalledTimes(2));
    expect(api.checkCvDuplicate).toHaveBeenLastCalledWith(HASH, 'i2', null);

    selectTraining('i1');
    await screen.findByText('No previous upload of this CV was found.');
    expect(api.checkCvDuplicate).toHaveBeenCalledTimes(2);

    // A different file is checked anew.
    hashing.sha256Hex.mockResolvedValue('b'.repeat(64));
    fireEvent.click(container.querySelector('button[type="button"]') as HTMLButtonElement);
    chooseCv(container, 'other.pdf');
    await waitFor(() => expect(api.checkCvDuplicate).toHaveBeenLastCalledWith('b'.repeat(64), 'i1', null));
  });

  it('checks an "Other" training once typing pauses, not on every keystroke', async () => {
    api.checkCvDuplicate.mockResolvedValue({ duplicate: true, previouslyUploaded: true });
    const { container } = await openForm();
    selectTraining('__OTHER__');
    chooseCv(container);
    await waitFor(() => expect(api.checkCvDuplicate).toHaveBeenCalledWith(HASH, null, null));
    const input = screen.getByPlaceholderText('e.g. Embedded Systems');
    for (const text of ['R', 'Ro', 'Rob', 'Robotics']) {
      fireEvent.change(input, { target: { value: text } });
    }

    expect((await screen.findByRole('alert', {}, { timeout: 2000 })).textContent).toMatch(/This CV has already been submitted\./);
    expect(api.checkCvDuplicate).toHaveBeenCalledTimes(2);
    expect(api.checkCvDuplicate).toHaveBeenLastCalledWith(HASH, null, 'Robotics');
  });

  it('still shows the server\'s refusal if a duplicate appears between the check and the submission', async () => {
    api.checkCvDuplicate.mockResolvedValue({ duplicate: false, previouslyUploaded: false });
    api.submitApplication.mockRejectedValue(new api.ReviewSubmissionError('This CV has already been submitted with an application, so it cannot be used for another application. Please upload a different CV.', 'CV_ALREADY_SUBMITTED'));
    const { container } = await openForm();
    selectTraining('i1');
    chooseCv(container);
    await screen.findByText('No previous upload of this CV was found.');

    fireEvent.click(submitButton());
    expect(await screen.findByText(/This CV has already been submitted with an application/)).toBeTruthy();
    // The CV message, not the one-application page.
    expect(screen.queryByText('You have already applied')).toBeNull();
  });
});

// The 7 existing accounts (6 applicants with pending applications and 1 who
// became an intern) are refused by the server on the upload and the final
// submission; these tests cover what the Apply page does with that answer.
describe('Apply page: one application per applicant', () => {
  beforeEach(() => {
    api.getInternships.mockResolvedValue([
      { id: 'i1', title: 'Backend', isActive: true, createdAt: 'c' },
      { id: 'i2', title: 'Frontend Developer', isActive: true, createdAt: 'c' },
    ]);
    api.getApplicationIntake.mockResolvedValue({ applicationsOpen: true });
    hashing.sha256Hex.mockResolvedValue(HASH);
    api.checkCvDuplicate.mockResolvedValue({ duplicate: false, previouslyUploaded: false });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.value = { user: null, role: null, loading: false };
  });

  it.each([
    ['an applicant whose application is still pending', 'APPLICANT', '/applicant/profile'],
    ['an applicant who became an intern', 'INTERN', '/intern'],
  ])('shows "already applied" instead of the form to %s', async (_label, role, home) => {
    auth.value = { user: { id: 'auth-id' }, role, loading: false };
    api.getApplicationEligibility.mockResolvedValue({ canApply: false });
    renderApply();

    expect(await screen.findByText('You have already applied')).toBeTruthy();
    expect(screen.getByText(/whichever training or CV you choose/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /submit application/i })).toBeNull();
    expect(screen.getByRole('link', { name: /go to my account/i }).getAttribute('href')).toBe(home);
    expect(api.submitApplication).not.toHaveBeenCalled();
  });

  it('shows the form to a signed-in user with no submitted application', async () => {
    auth.value = { user: { id: 'auth-id' }, role: 'APPLICANT', loading: false };
    api.getApplicationEligibility.mockResolvedValue({ canApply: true });
    renderApply();
    expect(await screen.findByText('Start your application')).toBeTruthy();
    expect(api.getApplicationEligibility).toHaveBeenCalledTimes(1);
  });

  it('never treats a failed eligibility check as "may apply": no form until a retry succeeds', async () => {
    auth.value = { user: { id: 'auth-id' }, role: 'APPLICANT', loading: false };
    api.getApplicationEligibility.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ canApply: true });
    renderApply();

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not check whether you can apply/);
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Start your application')).toBeTruthy();
  });

  it('does not ask a guest for eligibility, and lets a genuinely new applicant apply', async () => {
    api.submitApplication.mockResolvedValue({ applicationId: 'a', status: 'DRAFT', message: 'ok' });
    const { container } = await openForm();
    selectTraining('i1');
    chooseCv(container);
    await screen.findByText('No previous upload of this CV was found.');
    fireEvent.click(submitButton());

    expect(await screen.findByText('Application received')).toBeTruthy();
    expect(api.getApplicationEligibility).not.toHaveBeenCalled();
  });

  it('shows "already applied" when the server refuses a guest\'s upload (identified by the email in the CV), even with a different training and CV', async () => {
    api.submitApplication.mockRejectedValue(new api.ReviewSubmissionError('already', 'PREVIOUS_APPLICATION_EXISTS'));
    const { container } = await openForm();
    selectTraining('i2');
    chooseCv(container, 'completely-different-cv.pdf');
    await screen.findByText('No previous upload of this CV was found.');
    fireEvent.click(submitButton());

    expect(await screen.findByText('You have already applied')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/login');
  });
});

// Regression (reported in the browser): a CV that was already submitted,
// re-uploaded for a different training, must show the duplicate-CV message
// before anything is uploaded, not "You have already applied".
describe('Apply page: a previously submitted CV', () => {
  beforeEach(() => {
    api.getInternships.mockResolvedValue([
      { id: 'i1', title: 'Backend', isActive: true, createdAt: 'c' },
      { id: 'i2', title: 'Frontend Developer', isActive: true, createdAt: 'c' },
    ]);
    api.getApplicationIntake.mockResolvedValue({ applicationsOpen: true });
    hashing.sha256Hex.mockResolvedValue(HASH);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('says the CV was already submitted, for a different training too, and does not upload it', async () => {
    api.checkCvDuplicate.mockResolvedValue({ duplicate: true, previouslyUploaded: true });
    const { container } = await openForm();
    chooseCv(container);

    // Shown as soon as the CV is selected, before a training is chosen.
    expect((await screen.findByRole('alert')).textContent).toMatch(/This CV has already been submitted\..*cannot be used for another application/);
    selectTraining('i2');
    await waitFor(() => expect(api.checkCvDuplicate).toHaveBeenLastCalledWith(HASH, 'i2', null));
    expect((await screen.findByRole('alert')).textContent).toMatch(/This CV has already been submitted\./);
    expect(submitButton().disabled).toBe(true);
    fireEvent.submit(submitButton().closest('form') as HTMLFormElement);
    expect(api.submitApplication).not.toHaveBeenCalled();
    expect(screen.queryByText('You have already applied')).toBeNull();
  });

  it('shows the server\'s duplicate-CV refusal (not "already applied") when the check could not run in advance', async () => {
    hashing.sha256Hex.mockRejectedValue(new CvHashUnavailableError());
    api.submitApplication.mockRejectedValue(new api.ReviewSubmissionError('This CV has already been submitted with an application, so it cannot be used for another application. Please upload a different CV.', 'CV_ALREADY_SUBMITTED'));
    const { container } = await openForm();
    selectTraining('i2');
    chooseCv(container);
    await screen.findByText(/cannot be checked in advance/);
    fireEvent.click(submitButton());

    expect(await screen.findByText(/This CV has already been submitted with an application/)).toBeTruthy();
    expect(screen.queryByText('You have already applied')).toBeNull();
    // The form stays, so a different CV can be chosen.
    expect(screen.getByRole('combobox')).toBeTruthy();
  });
});
