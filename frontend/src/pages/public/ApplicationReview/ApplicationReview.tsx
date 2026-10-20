import { useState } from 'react';

  import { useQuery } from '@tanstack/react-query';
  
  import {
    BriefcaseBusiness,
    CheckCircle2,
    Loader2,
    Mail,
    MapPin,
    Phone,
    User,
  } from 'lucide-react';
  
  import {
    useParams,
    Link,
  } from 'react-router-dom';
  
  import { Button } from '@/components/ui/button';
  
  import {
    Card,
    CardContent,
  } from '@/components/ui/card';
  
  import { Input } from '@/components/ui/input';
  
  import {
    ACCOUNT_SIGN_IN_REQUIRED,
    getApplicationReview,
    APPLICATIONS_CLOSED,
    CV_ALREADY_SUBMITTED,
    PREVIOUS_APPLICATION_EXISTS,
    REVIEW_LINK_EXPIRED,
    REVIEW_LINK_NOT_FOUND,
    REVIEW_LINK_USED,
    ReviewSubmissionError,
    submitReviewedApplication,
  } from '@/features/applications/services/applications.service';
  
  import type {
    ApplicationReview as ApplicationReviewType,
    ExtractedCvData,
  } from '@/features/applications/types';
  import { cvTextList } from '@/features/applications/cv-text';
  import CvCheckNotice from '@/features/applications/components/CvCheckNotice';
  import { cvCheckAllowsSubmit, type CvCheckView } from '@/features/applications/cv-check';
  
  // Lists are reduced to strings (e.g. "English — Advanced") so structured
  // entries from the extraction are kept and pass the server's validation.
  function normalizeExtractedData(
    data: Partial<ExtractedCvData> | null | undefined,
  ): ExtractedCvData {
    return {
      fullName: data?.fullName ?? null,
      email: data?.email ?? null,
      phone: data?.phone ?? null,
      location: data?.location ?? null,
      summary: data?.summary ?? null,
  
      education: Array.isArray(data?.education)
        ? data.education
        : [],
  
      experience: Array.isArray(data?.experience)
        ? data.experience
        : [],
  
      skills: cvTextList(data?.skills),
  
      languages: cvTextList(data?.languages),
  
      certifications: cvTextList(data?.certifications),
  
      links: {
        linkedin:
          data?.links?.linkedin ?? null,
        github:
          data?.links?.github ?? null,
        portfolio:
          data?.links?.portfolio ?? null,
      },
    };
  }
  
  // What each review-link problem means for the applicant.
  const LINK_STATES: Record<string, { title: string; body: string; action?: { to: string; label: string } }> = {
    [REVIEW_LINK_USED]: {
      title: 'This link has already been used',
      body: 'Your application was already submitted with this link. Sign in to see your application and its status.',
      action: { to: '/login', label: 'Go to Sign In' },
    },
    [REVIEW_LINK_EXPIRED]: {
      title: 'This link has expired',
      body: 'Review links are valid for 24 hours. Please upload your CV again to receive a new link.',
      action: { to: '/apply', label: 'Apply again' },
    },
    [REVIEW_LINK_NOT_FOUND]: {
      title: 'This link is not valid',
      body: 'Please check that you opened the full link from your email.',
    },
    [CV_ALREADY_SUBMITTED]: {
      title: 'This CV has already been submitted',
      body: 'This CV file was already submitted with an application, so it cannot be used for another application. Please apply again with a different CV.',
      action: { to: '/apply', label: 'Apply with a different CV' },
    },
    [PREVIOUS_APPLICATION_EXISTS]: {
      title: 'You have already applied',
      body: 'Our records show that you have already submitted an application. Each applicant can apply only once, so this application cannot be submitted. Sign in to follow your existing application.',
      action: { to: '/login', label: 'Go to Sign In' },
    },
    [APPLICATIONS_CLOSED]: {
      title: 'Applications are currently closed',
      body: 'Your application cannot be completed while applications are closed. The information you submitted has been kept; you can finish your review with this link if applications reopen before it expires.',
    },
  };

  export default function ApplicationReview() {
    const { reviewToken = '' } =
      useParams<{
        reviewToken: string;
      }>();

    const reviewQuery = useQuery({
      queryKey: ['application-review', reviewToken],
      queryFn: () => getApplicationReview(reviewToken),
      enabled: Boolean(reviewToken),
      retry: false,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    });

    const review: ApplicationReviewType | undefined = reviewQuery.data;

    // Applicant edits on top of the loaded data (null until the first edit).
    const [edits, setEdits] =
      useState<ExtractedCvData | null>(
        null,
      );

    const form: ExtractedCvData | null =
      edits ??
      (review
        ? normalizeExtractedData({
            ...review.extractedData,
            email:
              review.reviewEmail ??
              review.extractedData?.email ??
              null,
          })
        : null);

    const [isSubmitting, setIsSubmitting] =
      useState(false);

    const [submitted, setSubmitted] =
      useState(false);

    // Submission errors keep the form visible so the applicant can act on them.
    const [submitError, setSubmitError] =
      useState<string | null>(null);

    const [signInRequired, setSignInRequired] =
      useState(false);

    // Refused at the final submission for good (CV already submitted, or the
    // applicant has already applied): the matching explanation replaces the form.
    const [blockedCode, setBlockedCode] =
      useState<string | null>(null);

    const updateField = (
      field:
        | 'fullName'
        | 'phone'
        | 'location'
        | 'summary',
      value: string,
    ) => {
      if (!form) {
        return;
      }

      setEdits({
        ...form,
        [field]: value,
      });
    };

    // The final submission refuses a CV that was already submitted; say so
    // before the applicant reviews everything (same feedback as the Apply
    // page), and do not offer a submit that cannot succeed or that has not
    // been checked. An earlier upload elsewhere is only a warning.
    const cvCheckView: CvCheckView = review
      ? (review.cvCheck ?? { status: 'failed' })
      : { status: 'idle' };
    const duplicateCheckBlocksSubmit = !cvCheckAllowsSubmit(cvCheckView);

    const handleFinalSubmit = async () => {
      if (!reviewToken || !form || isSubmitting || duplicateCheckBlocksSubmit) {
        return;
      }

      if (!form.fullName?.trim()) {
        setSubmitError(
          'Full name is required.',
        );

        return;
      }

      try {
        setIsSubmitting(true);
        setSubmitError(null);
        setSignInRequired(false);

        await submitReviewedApplication(
          reviewToken,
          form,
        );

        setSubmitted(true);
      } catch (err) {
        if (
          err instanceof ReviewSubmissionError &&
          (err.code === CV_ALREADY_SUBMITTED ||
            err.code === PREVIOUS_APPLICATION_EXISTS)
        ) {
          setBlockedCode(err.code);
          return;
        }

        setSignInRequired(
          err instanceof ReviewSubmissionError &&
            err.code === ACCOUNT_SIGN_IN_REQUIRED,
        );

        setSubmitError(
          err instanceof Error
            ? err.message
            : 'Unable to submit application.',
        );
      } finally {
        setIsSubmitting(false);
      }
    };

    if (reviewToken && reviewQuery.isPending) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      );
    }

    if (submitted) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
          <Card className="w-full max-w-lg">
            <CardContent className="p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>

              <h1 className="mt-6 text-2xl font-semibold">
                Application submitted
              </h1>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Your application has been submitted
                successfully and is now available to
                the recruitment team.
              </p>

              <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-left">
                <p className="font-medium">
                  Track your application
                </p>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Sign in with your email address to see
                  your profile and the status of your
                  internship applications.
                </p>
              </div>

              <Link
                to="/login"
                className="mt-6 block"
              >
                <Button className="w-full">
                  Go to Sign In
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      );
    }

    if (blockedCode || !reviewToken || reviewQuery.isError || !review || !form) {
      const code = blockedCode
        ? blockedCode
        : reviewQuery.error instanceof ReviewSubmissionError
          ? reviewQuery.error.code
          : null;
      const state = code ? LINK_STATES[code] : undefined;

      return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
          <Card className="w-full max-w-lg">
            <CardContent className="p-8 text-center">
              <h1 className="text-xl font-semibold">
                {state?.title ?? 'Application unavailable'}
              </h1>

              <p className="mt-3 text-sm text-muted-foreground">
                {state?.body ??
                  reviewQuery.error?.message ??
                  'This application review is not available.'}
              </p>

              {state?.action && (
                <Link to={state.action.to} className="mt-6 inline-block">
                  <Button>{state.action.label}</Button>
                </Link>
              )}

              {!state && reviewQuery.isError && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-6"
                  onClick={() => void reviewQuery.refetch()}
                >
                  Try again
                </Button>
              )}
            </CardContent>
          </Card>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-muted/30">
        <div className="border-b bg-background">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <p className="text-sm font-medium text-primary">
              Internship Application
            </p>
  
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Review your information
            </h1>
  
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Please review the information below
              carefully and correct anything that
              is incomplete or inaccurate before
              submitting your application.
            </p>
          </div>
        </div>
  
        <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
          <CvCheckNotice
            view={cvCheckView}
            onRetry={() => void reviewQuery.refetch()}
            retrying={reviewQuery.isFetching}
          />

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <BriefcaseBusiness className="h-5 w-5 text-primary" />
                </div>
  
                <div>
                  <p className="text-sm text-muted-foreground">
                    Applying for
                  </p>
  
                  <h2 className="font-semibold">
                    {review.internship?.title ??
                      review.requestedTraining ??
                      'Internship'}
                  </h2>
                </div>
              </div>
            </CardContent>
          </Card>
  
          <Card>
            <CardContent className="space-y-6 p-8">
              <div>
                <h2 className="text-xl font-semibold">
                  Personal Information
                </h2>
  
                <p className="mt-1 text-sm text-muted-foreground">
                  Check your contact and personal
                  details.
                </p>
              </div>
  
              <div className="grid gap-6 md:grid-cols-2">
                <Field
                  label="Full Name"
                  icon={
                    <User className="h-4 w-4" />
                  }
                >
                  <Input
                    value={form.fullName ?? ''}
                    onChange={(event) =>
                      updateField(
                        'fullName',
                        event.target.value,
                      )
                    }
                  />
                </Field>
  
                <Field
                  label="Email"
                  icon={
                    <Mail className="h-4 w-4" />
                  }
                >
                  <Input
                    type="email"
                    value={form.email ?? ''}
                    readOnly
                    aria-readonly="true"
                    aria-describedby="review-email-note"
                    className="bg-muted/50"
                  />

                  <p
                    id="review-email-note"
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    This is the address your review link was sent to, so it cannot be changed here.
                  </p>
                </Field>
  
                <Field
                  label="Phone"
                  icon={
                    <Phone className="h-4 w-4" />
                  }
                >
                  <Input
                    value={form.phone ?? ''}
                    onChange={(event) =>
                      updateField(
                        'phone',
                        event.target.value,
                      )
                    }
                  />
                </Field>
  
                <Field
                  label="Location"
                  icon={
                    <MapPin className="h-4 w-4" />
                  }
                >
                  <Input
                    value={form.location ?? ''}
                    onChange={(event) =>
                      updateField(
                        'location',
                        event.target.value,
                      )
                    }
                  />
                </Field>
              </div>
  
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Professional Summary
                </label>
  
                <textarea
                  value={form.summary ?? ''}
                  onChange={(event) =>
                    updateField(
                      'summary',
                      event.target.value,
                    )
                  }
                  rows={5}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </CardContent>
          </Card>
  
          <Card>
            <CardContent className="space-y-6 p-8">
              <h2 className="text-xl font-semibold">
                Skills
              </h2>
  
              <div className="flex flex-wrap gap-2">
                {form.skills.length > 0 ? (
                  form.skills.map(
                    (skill, index) => (
                      <span
                        key={`${skill}-${index}`}
                        className="rounded-full border bg-background px-3 py-1.5 text-sm"
                      >
                        {skill}
                      </span>
                    ),
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No skills were found.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
  
          <Card>
            <CardContent className="space-y-6 p-8">
              <h2 className="text-xl font-semibold">
                Education
              </h2>
  
              {form.education.length > 0 ? (
                <div className="space-y-4">
                  {form.education.map(
                    (education, index) => (
                      <div
                        key={index}
                        className="rounded-xl border p-5"
                      >
                        <p className="font-medium">
                          {education.degree ||
                            education.fieldOfStudy ||
                            'Education'}
                        </p>
  
                        <p className="mt-1 text-sm text-muted-foreground">
                          {education.institution ??
                            'Institution not provided'}
                        </p>
  
                        {(education.startDate ||
                          education.endDate) && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {education.startDate ??
                              ''}
                            {' — '}
                            {education.endDate ??
                              ''}
                          </p>
                        )}
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No education information was
                  found.
                </p>
              )}
            </CardContent>
          </Card>
  
          <Card>
            <CardContent className="space-y-6 p-8">
              <h2 className="text-xl font-semibold">
                Experience
              </h2>
  
              {form.experience.length > 0 ? (
                <div className="space-y-4">
                  {form.experience.map(
                    (experience, index) => (
                      <div
                        key={index}
                        className="rounded-xl border p-5"
                      >
                        <p className="font-medium">
                          {experience.position ??
                            'Position'}
                        </p>
  
                        <p className="mt-1 text-sm text-muted-foreground">
                          {experience.company ??
                            'Company not provided'}
                        </p>
  
                        {(experience.startDate ||
                          experience.endDate) && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {experience.startDate ??
                              ''}
                            {' — '}
                            {experience.endDate ??
                              ''}
                          </p>
                        )}
  
                        {experience.description && (
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {experience.description}
                          </p>
                        )}
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No work experience was found.
                </p>
              )}
            </CardContent>
          </Card>
  
          {submitError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <p>{submitError}</p>

              {signInRequired && (
                <Link
                  to="/login"
                  className="mt-3 inline-block"
                >
                  <Button
                    type="button"
                    variant="outline"
                  >
                    Go to Sign In
                  </Button>
                </Link>
              )}
            </div>
          )}
  
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleFinalSubmit}
              disabled={isSubmitting || duplicateCheckBlocksSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Application'
              )}
            </Button>
          </div>
        </div>
      </main>
    );
  }
  
  function Field({
    label,
    icon,
    children,
  }: {
    label: string;
    icon: React.ReactNode;
    children: React.ReactNode;
  }) {
    return (
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </label>
  
        {children}
      </div>
    );
  }
