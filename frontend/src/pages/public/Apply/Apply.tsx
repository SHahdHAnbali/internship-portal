import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';

import {
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  Mail,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import {
  Card,
  CardContent,
} from '@/components/ui/card';

import { Input } from '@/components/ui/input';

import { getApplicationIntake, submitApplication } from '@/features/applications/services/applications.service';

import { getInternships } from '@/features/internships/services/internships.service';

import type { Internship } from '@/features/internships/types';

import {
  useSearchParams,
} from 'react-router-dom';

const OTHER_VALUE = '__OTHER__';

export default function Apply() {
  const fileInputRef =
    useRef<HTMLInputElement>(null);

    const [searchParams] =
  useSearchParams();

const internshipIdFromUrl =
  searchParams.get('internshipId');

  const [internships, setInternships] =
    useState<Internship[]>([]);

  const [
    trainingSelection,
    setTrainingSelection,
  ] = useState('');

  const [
    requestedTraining,
    setRequestedTraining,
  ] = useState('');

  const [cv, setCv] =
    useState<File | null>(null);

  const [isDragging, setIsDragging] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState(false);

  // Portal-wide intake (ADMIN). The server refuses submissions when closed.
  const [intakeClosed, setIntakeClosed] =
    useState(false);

  const isOther =
    trainingSelection === OTHER_VALUE;

    useEffect(() => {
      const loadInternships =
        async () => {
          try {
            const [data, intake] =
              await Promise.all([getInternships(), getApplicationIntake()]);

            setIntakeClosed(!intake.applicationsOpen);
    
            const activeInternships =
              data.filter(
                (internship) =>
                  internship.isActive,
              );
    
            setInternships(
              activeInternships,
            );
    
            if (
              internshipIdFromUrl &&
              activeInternships.some(
                (internship) =>
                  internship.id ===
                  internshipIdFromUrl,
              )
            ) {
              setTrainingSelection(
                internshipIdFromUrl,
              );
    
              setRequestedTraining('');
            }
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : 'Unable to load available internships.',
            );
          } finally {
            setIsLoading(false);
          }
        };
    
      void loadInternships();
    }, [internshipIdFromUrl]);

  const validateFile = (
    file: File,
  ): boolean => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    const maxSize =
      5 * 1024 * 1024;

    if (
      !allowedTypes.includes(
        file.type,
      )
    ) {
      setError(
        'Please upload a PDF or DOCX file.',
      );

      return false;
    }

    if (file.size > maxSize) {
      setError(
        'CV file must be 5 MB or smaller.',
      );

      return false;
    }

    return true;
  };

  const handleFile = (
    file: File,
  ) => {
    setError(null);

    if (!validateFile(file)) {
      return;
    }

    setCv(file);
  };

  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();

    setIsDragging(false);

    const file =
      event.dataTransfer.files?.[0];

    if (file) {
      handleFile(file);
    }
  };

  const handleSubmit = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (!trainingSelection) {
      setError(
        'Please select a training opportunity.',
      );

      return;
    }

    if (
      isOther &&
      !requestedTraining.trim()
    ) {
      setError(
        'Please enter the training area you are interested in.',
      );

      return;
    }

    if (!cv) {
      setError(
        'Please upload your CV.',
      );

      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const internshipId =
        isOther
          ? null
          : trainingSelection;

      const otherTraining =
        isOther
          ? requestedTraining.trim()
          : null;

      await submitApplication(
        internshipId,
        otherTraining,
        cv,
      );

      setSuccess(true);

      setCv(null);
      setTrainingSelection('');
      setRequestedTraining('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to submit your application.',
      );
      // Intake may have closed while the form was open.
      void getApplicationIntake()
        .then((intake) => setIntakeClosed(!intake.applicationsOpen))
        .catch(() => undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    Boolean(cv) &&
    Boolean(trainingSelection) &&
    (!isOther ||
      Boolean(
        requestedTraining.trim(),
      ));

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (intakeClosed) {
    return (
      <main className="min-h-screen bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="px-8 py-12 text-center">
              <h1 className="text-2xl font-semibold">Applications are currently closed</h1>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                We are not accepting new applications at the moment. Please check back when the next intake opens.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="px-8 py-12 text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>

              <h1 className="text-2xl font-semibold">
                Application received
              </h1>

              <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                Your application has been received
                successfully! Please check your email
                for a link to review and complete your
                application.
              </p>

              <div className="mt-8 rounded-xl border bg-muted/40 p-6 text-left">
                <div className="flex gap-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                  <div>
                    <p className="font-medium">
                      Your CV was received
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Our system extracted your
                      details from your CV so you
                      can review them.
                    </p>
                  </div>
                </div>

                <div className="my-5 border-t" />

                <div className="flex gap-4">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                  <div>
                    <p className="font-medium">
                      Check your email
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      We sent a review link to the
                      email address found in your
                      CV. Check your inbox and your
                      spam or junk folder. The link
                      expires in 24 hours.
                    </p>
                  </div>
                </div>

                <div className="my-5 border-t" />

                <div className="flex gap-4">
                  <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                  <div>
                    <p className="font-medium">
                      Review and submit
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Open the link, review the
                      information extracted from
                      your CV, correct any mistakes,
                      and submit the reviewed
                      application. Your application
                      is complete only after you
                      submit it.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="mt-8"
                onClick={() =>
                  setSuccess(false)
                }
              >
                Back to application page
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground">
              <BriefcaseBusiness className="h-4 w-4" />
              Internship Application
            </div>

            <h1 className="text-4xl font-semibold tracking-tight">
              Start your application
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Choose an available training
              opportunity or tell us what area
              you are interested in, then upload
              your CV.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_340px]">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-8">
            <form
              onSubmit={handleSubmit}
              className="space-y-8"
            >
              {/* Training */}
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    1
                  </div>

                  <div>
                    <h2 className="font-semibold">
                      Select training
                    </h2>

                    <p className="text-sm text-muted-foreground">
                      Choose an available
                      internship or select Other.
                    </p>
                  </div>
                </div>

                <select
                  value={
                    trainingSelection
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    setTrainingSelection(
                      value,
                    );

                    if (
                      value !==
                      OTHER_VALUE
                    ) {
                      setRequestedTraining(
                        '',
                      );
                    }

                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-lg border border-input bg-background px-4 text-sm outline-none transition focus:border-primary"
                  required
                >
                  <option value="">
                    Select training
                    opportunity
                  </option>

                  {internships.map(
                    (internship) => (
                      <option
                        key={
                          internship.id
                        }
                        value={
                          internship.id
                        }
                      >
                        {
                          internship.title
                        }
                      </option>
                    ),
                  )}

                  <option
                    value={OTHER_VALUE}
                  >
                    Other
                  </option>
                </select>

                {isOther && (
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium">
                      What training are you
                      interested in?
                    </label>

                    <Input
                      value={
                        requestedTraining
                      }
                      onChange={(
                        event,
                      ) =>
                        setRequestedTraining(
                          event.target
                            .value,
                        )
                      }
                      disabled={
                        isSubmitting
                      }
                      placeholder="e.g. Embedded Systems"
                    />

                    <p className="mt-2 text-xs text-muted-foreground">
                      Tell us the training area
                      you would like the company
                      to consider.
                    </p>
                  </div>
                )}
              </div>

              {/* CV */}
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    2
                  </div>

                  <div>
                    <h2 className="font-semibold">
                      Upload your CV
                    </h2>

                    <p className="text-sm text-muted-foreground">
                      Upload your latest CV as
                      part of your application.
                    </p>
                  </div>
                </div>

                {!cv ? (
                  <div
                    onDragOver={(
                      event,
                    ) => {
                      event.preventDefault();
                      setIsDragging(
                        true,
                      );
                    }}
                    onDragLeave={() =>
                      setIsDragging(
                        false,
                      )
                    }
                    onDrop={
                      handleDrop
                    }
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
                      isDragging
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/60 hover:bg-muted/30'
                    }`}
                  >
                    <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground" />

                    <p className="mt-4 font-medium">
                      Drop your CV here
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      or click to browse your
                      files
                    </p>

                    <p className="mt-4 text-xs text-muted-foreground">
                      PDF or DOCX • Maximum 5 MB
                    </p>

                    <input
                      ref={
                        fileInputRef
                      }
                      type="file"
                      accept=".pdf,.docx"
                      className="hidden"
                      onChange={(
                        event,
                      ) => {
                        const file =
                          event.target
                            .files?.[0];

                        if (file) {
                          handleFile(
                            file,
                          );
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {cv.name}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {(
                            cv.size /
                            1024 /
                            1024
                          ).toFixed(
                            2,
                          )}{' '}
                          MB
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={
                        isSubmitting
                      }
                      onClick={() =>
                        setCv(null)
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={
                  isSubmitting ||
                  !canSubmit
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting
                    Application...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Submit Application
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-6">
              <h3 className="font-semibold">
                What happens next?
              </h3>

              <div className="mt-6 space-y-6">
                <Step
                  number="1"
                  title="Submit your application"
                  description="Choose a training area and upload your CV."
                />

                <Step
                  number="2"
                  title="Application review"
                  description="Your application is prepared for the recruitment process."
                />

                <Step
                  number="3"
                  title="Check your email"
                  description="You will receive instructions to review your application."
                />

                <Step
                  number="4"
                  title="Complete next steps"
                  description="Follow the instructions provided to continue your application."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="flex gap-4 p-6">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

              <div>
                <p className="text-sm font-medium">
                  Your data is protected
                </p>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Your CV is stored securely
                  and is used only for the
                  internship application
                  process.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold">
        {number}
      </div>

      <div>
        <p className="text-sm font-medium">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}