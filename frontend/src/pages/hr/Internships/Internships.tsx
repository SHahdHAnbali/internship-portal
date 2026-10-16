import {
  useState,
  type FormEvent,
} from 'react';

import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  Settings2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import {
  Card,
  CardContent,
} from '@/components/ui/card';

import { Input } from '@/components/ui/input';

import { useInternships } from '@/features/internships/hooks/useInternships';

import {
  getInternshipRequirements,
  saveInternshipRequirements,
} from '@/features/internships/services/internship-requirements.service';

import type {
  SaveInternshipRequirementsInput,
} from '@/features/internships/types';

interface RequirementsFormState {
  requiredSkills: string[];
  preferredSkills: string[];

  minimumEducation: string;

  minimumExperienceYears: string;

  languages: string[];
  certifications: string[];

  otherRequirements: string;
}

const EMPTY_REQUIREMENTS: RequirementsFormState = {
  requiredSkills: [],
  preferredSkills: [],

  minimumEducation: '',

  minimumExperienceYears: '',

  languages: [],
  certifications: [],

  otherRequirements: '',
};

export default function Internships() {
  const {
    internships,
    isLoading,
    isCreating,
    error,
    addInternship,
  } = useInternships();

  const [title, setTitle] =
    useState('');

  const [
    openInternshipId,
    setOpenInternshipId,
  ] = useState<string | null>(
    null,
  );

  const [
    requirements,
    setRequirements,
  ] =
    useState<RequirementsFormState>(
      EMPTY_REQUIREMENTS,
    );

  const [
    isLoadingRequirements,
    setIsLoadingRequirements,
  ] = useState(false);

  const [
    isSavingRequirements,
    setIsSavingRequirements,
  ] = useState(false);

  const [
    requirementsError,
    setRequirementsError,
  ] = useState<string | null>(
    null,
  );

  const [
    saveSuccess,
    setSaveSuccess,
  ] = useState(false);

  const handleSubmit = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    const trimmedTitle =
      title.trim();

    if (!trimmedTitle) {
      return;
    }

    try {
      await addInternship(
        trimmedTitle,
      );

      setTitle('');
    } catch {
      // handled by hook
    }
  };

  const handleToggleRequirements =
    async (
      internshipId: string,
    ) => {
      if (
        openInternshipId ===
        internshipId
      ) {
        setOpenInternshipId(
          null,
        );

        return;
      }

      setOpenInternshipId(
        internshipId,
      );

      setRequirements(
        EMPTY_REQUIREMENTS,
      );

      setRequirementsError(
        null,
      );

      setSaveSuccess(false);

      try {
        setIsLoadingRequirements(
          true,
        );

        const data =
          await getInternshipRequirements(
            internshipId,
          );

        if (!data) {
          setRequirements(
            EMPTY_REQUIREMENTS,
          );

          return;
        }

        setRequirements({
          requiredSkills:
            data.requiredSkills ??
            [],

          preferredSkills:
            data.preferredSkills ??
            [],

          minimumEducation:
            data.minimumEducation ??
            '',

          minimumExperienceYears:
            data.minimumExperienceYears ===
            null
              ? ''
              : String(
                  data.minimumExperienceYears,
                ),

          languages:
            data.languages ?? [],

          certifications:
            data.certifications ??
            [],

          otherRequirements:
            data.otherRequirements ??
            '',
        });
      } catch (err) {
        setRequirementsError(
          err instanceof Error
            ? err.message
            : 'Unable to load requirements.',
        );
      } finally {
        setIsLoadingRequirements(
          false,
        );
      }
    };

  const handleSaveRequirements =
    async (
      internshipId: string,
    ) => {
      try {
        setIsSavingRequirements(
          true,
        );

        setRequirementsError(
          null,
        );

        setSaveSuccess(false);

        const experienceValue =
          requirements.minimumExperienceYears.trim();

        const input: SaveInternshipRequirementsInput =
          {
            requiredSkills:
              cleanList(
                requirements.requiredSkills,
              ),

            preferredSkills:
              cleanList(
                requirements.preferredSkills,
              ),

            minimumEducation:
              requirements.minimumEducation.trim() ||
              null,

            minimumExperienceYears:
              experienceValue
                ? Number(
                    experienceValue,
                  )
                : null,

            languages:
              cleanList(
                requirements.languages,
              ),

            certifications:
              cleanList(
                requirements.certifications,
              ),

            otherRequirements:
              requirements.otherRequirements.trim() ||
              null,
          };

        const saved =
          await saveInternshipRequirements(
            internshipId,
            input,
          );

        setRequirements({
          requiredSkills:
            saved.requiredSkills,

          preferredSkills:
            saved.preferredSkills,

          minimumEducation:
            saved.minimumEducation ??
            '',

          minimumExperienceYears:
            saved.minimumExperienceYears ===
            null
              ? ''
              : String(
                  saved.minimumExperienceYears,
                ),

          languages:
            saved.languages,

          certifications:
            saved.certifications,

          otherRequirements:
            saved.otherRequirements ??
            '',
        });

        setSaveSuccess(true);
      } catch (err) {
        setRequirementsError(
          err instanceof Error
            ? err.message
            : 'Unable to save requirements.',
        );
      } finally {
        setIsSavingRequirements(
          false,
        );
      }
    };

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          Internships
        </h1>

        <p className="mt-2 text-muted-foreground">
          Create and manage internship
          opportunities and their
          candidate requirements.
        </p>
      </div>

      {/* Create Internship */}
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={
              handleSubmit
            }
            className="flex gap-3"
          >
            <Input
              value={title}
              onChange={(
                event,
              ) =>
                setTitle(
                  event.target
                    .value,
                )
              }
              placeholder="Internship title"
              disabled={
                isCreating
              }
            />

            <Button
              type="submit"
              disabled={
                isCreating ||
                !title.trim()
              }
            >
              {isCreating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}

              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Main Error */}
      {error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : internships.length ===
        0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <BriefcaseBusiness className="mb-4 h-10 w-10 text-muted-foreground" />

            <h2 className="text-lg font-semibold">
              No internships yet
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Create your first
              internship opportunity
              above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {internships.map(
            (internship) => {
              const isOpen =
                openInternshipId ===
                internship.id;

              return (
                <Card
                  key={
                    internship.id
                  }
                >
                  <CardContent className="p-0">
                    {/* Internship Header */}
                    <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="font-semibold">
                            {
                              internship.title
                            }
                          </h2>

                          <Badge
                            variant={
                              internship.isActive
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {internship.isActive
                              ? 'Active'
                              : 'Inactive'}
                          </Badge>
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          Created{' '}
                          {new Date(
                            internship.createdAt,
                          ).toLocaleDateString()}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void handleToggleRequirements(
                            internship.id,
                          )
                        }
                        className="gap-2"
                      >
                        <Settings2 className="h-4 w-4" />

                        Requirements

                        {isOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {/* Requirements */}
                    {isOpen && (
                      <div className="border-t bg-slate-50/50 p-5">
                        {isLoadingRequirements ? (
                          <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div>
                              <h3 className="text-lg font-semibold">
                                Internship
                                Requirements
                              </h3>

                              <p className="mt-1 text-sm text-muted-foreground">
                                Define the
                                requirements
                                that candidates
                                will be matched
                                against.
                              </p>
                            </div>

                            {requirementsError && (
                              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                                {
                                  requirementsError
                                }
                              </div>
                            )}

                            {saveSuccess && (
                              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                                Requirements
                                saved
                                successfully.
                              </div>
                            )}

                            <div className="grid gap-6 lg:grid-cols-2">
                              <TagInput
                                label="Required Skills"
                                placeholder="e.g. React"
                                values={
                                  requirements.requiredSkills
                                }
                                onChange={(
                                  values,
                                ) =>
                                  setRequirements(
                                    (
                                      current,
                                    ) => ({
                                      ...current,
                                      requiredSkills:
                                        values,
                                    }),
                                  )
                                }
                              />

                              <TagInput
                                label="Preferred Skills"
                                placeholder="e.g. Tailwind CSS"
                                values={
                                  requirements.preferredSkills
                                }
                                onChange={(
                                  values,
                                ) =>
                                  setRequirements(
                                    (
                                      current,
                                    ) => ({
                                      ...current,
                                      preferredSkills:
                                        values,
                                    }),
                                  )
                                }
                              />

                              <div className="space-y-2">
                                <label className="text-sm font-medium">
                                  Minimum
                                  Education
                                </label>

                                <Input
                                  value={
                                    requirements.minimumEducation
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    setRequirements(
                                      (
                                        current,
                                      ) => ({
                                        ...current,

                                        minimumEducation:
                                          event
                                            .target
                                            .value,
                                      }),
                                    )
                                  }
                                  placeholder="e.g. Computer Science, Computer Engineering or related"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium">
                                  Minimum
                                  Experience
                                  (years)
                                </label>

                                <Input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={
                                    requirements.minimumExperienceYears
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    setRequirements(
                                      (
                                        current,
                                      ) => ({
                                        ...current,

                                        minimumExperienceYears:
                                          event
                                            .target
                                            .value,
                                      }),
                                    )
                                  }
                                  placeholder="0"
                                />
                              </div>

                              <TagInput
                                label="Languages"
                                placeholder="e.g. English"
                                values={
                                  requirements.languages
                                }
                                onChange={(
                                  values,
                                ) =>
                                  setRequirements(
                                    (
                                      current,
                                    ) => ({
                                      ...current,
                                      languages:
                                        values,
                                    }),
                                  )
                                }
                              />

                              <TagInput
                                label="Certifications"
                                placeholder="e.g. AWS"
                                values={
                                  requirements.certifications
                                }
                                onChange={(
                                  values,
                                ) =>
                                  setRequirements(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      certifications:
                                        values,
                                    }),
                                  )
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                Other
                                Requirements
                              </label>

                              <textarea
                                value={
                                  requirements.otherRequirements
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setRequirements(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      otherRequirements:
                                        event
                                          .target
                                          .value,
                                    }),
                                  )
                                }
                                placeholder="e.g. Good communication, teamwork and problem-solving skills"
                                rows={4}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                              />
                            </div>

                            <div className="flex justify-end border-t pt-5">
                              <Button
                                type="button"
                                disabled={
                                  isSavingRequirements
                                }
                                onClick={() =>
                                  void handleSaveRequirements(
                                    internship.id,
                                  )
                                }
                              >
                                {isSavingRequirements ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="mr-2 h-4 w-4" />
                                )}

                                Save
                                Requirements
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

function TagInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;

  placeholder: string;

  values: string[];

  onChange: (
    values: string[],
  ) => void;
}) {
  const [value, setValue] =
    useState('');

  const addValue = () => {
    const trimmed =
      value.trim();

    if (!trimmed) {
      return;
    }

    const exists =
      values.some(
        (item) =>
          item.toLowerCase() ===
          trimmed.toLowerCase(),
      );

    if (exists) {
      setValue('');

      return;
    }

    onChange([
      ...values,
      trimmed,
    ]);

    setValue('');
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}
      </label>

      <div className="flex gap-2">
        <Input
          value={value}
          placeholder={
            placeholder
          }
          onChange={(
            event,
          ) =>
            setValue(
              event.target
                .value,
            )
          }
          onKeyDown={(
            event,
          ) => {
            if (
              event.key ===
              'Enter'
            ) {
              event.preventDefault();

              addValue();
            }
          }}
        />

        <Button
          type="button"
          variant="outline"
          onClick={
            addValue
          }
        >
          Add
        </Button>
      </div>

      {values.length >
        0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {values.map(
            (item) => (
              <Badge
                key={item}
                variant="secondary"
                className="gap-1 py-1 pl-2.5 pr-1.5"
              >
                {item}

                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      values.filter(
                        (
                          existing,
                        ) =>
                          existing !==
                          item,
                      ),
                    )
                  }
                  className="rounded-sm p-0.5 hover:bg-black/10"
                  aria-label={`Remove ${item}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function cleanList(
  values: string[],
) {
  return values
    .map((value) =>
      value.trim(),
    )
    .filter(Boolean);
}