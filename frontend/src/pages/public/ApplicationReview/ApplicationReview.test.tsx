// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => {
  class ReviewSubmissionError extends Error {
    readonly code: string | null;
    constructor(message: string, code: string | null) { super(message); this.code = code; }
  }
  return {
    ReviewSubmissionError,
    getApplicationReview: vi.fn(),
    submitReviewedApplication: vi.fn(),
    APPLICATIONS_CLOSED: 'APPLICATIONS_CLOSED',
    REVIEW_LINK_NOT_FOUND: 'REVIEW_LINK_NOT_FOUND',
    REVIEW_LINK_USED: 'REVIEW_LINK_USED',
    REVIEW_LINK_EXPIRED: 'REVIEW_LINK_EXPIRED',
    ACCOUNT_SIGN_IN_REQUIRED: 'ACCOUNT_SIGN_IN_REQUIRED',
    PREVIOUS_APPLICATION_EXISTS: 'PREVIOUS_APPLICATION_EXISTS',
    CV_ALREADY_SUBMITTED: 'CV_ALREADY_SUBMITTED',
  };
});
vi.mock('@/features/applications/services/applications.service', () => api);

import ApplicationReview from './ApplicationReview';

describe('ApplicationReview while portal intake is closed', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('explains that intake is closed and that the submitted information was kept, with no form', async () => {
    api.getApplicationReview.mockRejectedValue(new api.ReviewSubmissionError('closed', 'APPLICATIONS_CLOSED'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/application-review/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde']}>
          <Routes><Route path="/application-review/:reviewToken" element={<ApplicationReview />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Applications are currently closed')).toBeTruthy();
    expect(screen.getByText(/has been kept/)).toBeTruthy();
    expect(api.submitReviewedApplication).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull();
  });
});

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

type CvCheck = { status: 'checked'; duplicate: boolean; previouslyUploaded: boolean } | { status: 'failed' } | { status: 'unavailable' };

function review(cvCheck: CvCheck) {
  return {
    applicationId: 'app-1',
    reviewEmail: 'lina@example.com',
    internship: { id: 'i1', title: 'Frontend Developer' },
    requestedTraining: null,
    cvCheck,
    extractedData: { fullName: 'Lina Example', email: 'lina@example.com' },
  };
}

const checked = (duplicate: boolean, previouslyUploaded: boolean): CvCheck => ({ status: 'checked', duplicate, previouslyUploaded });

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/application-review/${TOKEN}`]}>
        <Routes><Route path="/application-review/:reviewToken" element={<ApplicationReview />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const submit = () => screen.getByRole('button', { name: 'Submit Application' }) as HTMLButtonElement;

describe('ApplicationReview: CV check before the final submission', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('says so as soon as the review opens and does not allow submitting a CV that was already submitted', async () => {
    api.getApplicationReview.mockResolvedValue(review(checked(true, true)));
    renderReview();
    expect((await screen.findByRole('alert')).textContent).toMatch(/This CV has already been submitted\./);
    expect(submit().disabled).toBe(true);
    fireEvent.click(submit());
    expect(api.submitReviewedApplication).not.toHaveBeenCalled();
  });

  it('warns, without blocking, about a CV uploaded before for another training', async () => {
    api.getApplicationReview.mockResolvedValue(review(checked(false, true)));
    api.submitReviewedApplication.mockResolvedValue({ applicationId: 'app-1', status: 'NEW', submittedAt: 's', message: 'ok' });
    renderReview();
    expect((await screen.findByRole('alert')).textContent).toMatch(/matches a file that was uploaded before/);
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await waitFor(() => expect(api.submitReviewedApplication).toHaveBeenCalledTimes(1));
  });

  it('confirms a genuinely new CV, like the Apply page', async () => {
    api.getApplicationReview.mockResolvedValue(review(checked(false, false)));
    renderReview();
    expect(await screen.findByText('No previous upload of this CV was found.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(submit().disabled).toBe(false);
  });

  it('does not treat a failed check as clear: submitting waits for a successful re-check', async () => {
    api.getApplicationReview.mockResolvedValueOnce(review({ status: 'failed' })).mockResolvedValueOnce(review(checked(false, false)));
    renderReview();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not check this CV against previous uploads/);
    expect(screen.queryByText('No previous upload of this CV was found.')).toBeNull();
    expect(submit().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('No previous upload of this CV was found.')).toBeTruthy();
    expect(api.getApplicationReview).toHaveBeenCalledTimes(2);
    expect(submit().disabled).toBe(false);
  });

  it('explains when a CV cannot be checked in advance and leaves the decision to the submission', async () => {
    api.getApplicationReview.mockResolvedValue(review({ status: 'unavailable' }));
    renderReview();
    expect(await screen.findByText(/cannot be checked in advance/)).toBeTruthy();
    expect(submit().disabled).toBe(false);
  });
});

describe('ApplicationReview: one application per applicant', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows "already applied", with no form, when the applicant has already submitted an application', async () => {
    api.getApplicationReview.mockRejectedValue(new api.ReviewSubmissionError('already', 'PREVIOUS_APPLICATION_EXISTS'));
    renderReview();
    expect(await screen.findByText('You have already applied')).toBeTruthy();
    expect(screen.getByText(/Each applicant can apply only once/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/login');
  });

  it('shows "already applied" when the final submission is refused for that reason', async () => {
    api.getApplicationReview.mockResolvedValue(review(checked(false, false)));
    api.submitReviewedApplication.mockRejectedValue(new api.ReviewSubmissionError('already', 'PREVIOUS_APPLICATION_EXISTS'));
    renderReview();
    fireEvent.click(await waitFor(() => submit()));
    expect(await screen.findByText('You have already applied')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull();
  });
});

describe('ApplicationReview: a CV already submitted with another application', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('explains it, with no form, when the review link is opened', async () => {
    api.getApplicationReview.mockRejectedValue(new api.ReviewSubmissionError('cv', 'CV_ALREADY_SUBMITTED'));
    renderReview();
    expect(await screen.findByText('This CV has already been submitted')).toBeTruthy();
    expect(screen.getByText(/cannot be used for another application/)).toBeTruthy();
    expect(screen.queryByText('You have already applied')).toBeNull();
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull();
    expect(screen.getByRole('link', { name: /different cv/i }).getAttribute('href')).toBe('/apply');
  });

  it('explains it when the final submission is refused for that reason', async () => {
    api.getApplicationReview.mockResolvedValue(review(checked(false, false)));
    api.submitReviewedApplication.mockRejectedValue(new api.ReviewSubmissionError('cv', 'CV_ALREADY_SUBMITTED'));
    renderReview();
    fireEvent.click(await waitFor(() => submit()));
    expect(await screen.findByText('This CV has already been submitted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull();
  });
});
