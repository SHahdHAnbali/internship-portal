// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
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
