import { useState, type FormEvent } from 'react';

import { Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  ApplicantProfile,
  ApplicantProfileUpdate,
  ExtractedCvData,
} from '@/features/applications/types';
import { cvTextList } from '@/features/applications/cv-text';
import { safeExternalUrl } from '@/lib/safe-url';

type Education = ExtractedCvData['education'][number];
type Experience = ExtractedCvData['experience'][number];

const emptyEducation = (): Education => ({ institution: null, degree: null, fieldOfStudy: null, startDate: null, endDate: null });
const emptyExperience = (): Experience => ({ company: null, position: null, startDate: null, endDate: null, description: null });

const splitList = (value: string) =>
  value.split(',').map((item) => item.trim()).filter(Boolean);

const orNull = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

function initialState(profile: ApplicantProfile) {
  const data = profile.profileData;
  return {
    fullName: profile.fullName,
    phone: profile.phone ?? '',
    location: profile.location ?? '',
    summary: data?.summary ?? '',
    skills: cvTextList(data?.skills).join(', '),
    languages: cvTextList(data?.languages).join(', '),
    certifications: cvTextList(data?.certifications).join(', '),
    linkedin: data?.links?.linkedin ?? '',
    github: data?.links?.github ?? '',
    portfolio: data?.links?.portfolio ?? '',
    education: Array.isArray(data?.education) ? data.education.map((entry) => ({ ...emptyEducation(), ...entry })) : [],
    experience: Array.isArray(data?.experience) ? data.experience.map((entry) => ({ ...emptyExperience(), ...entry })) : [],
  };
}

type FormState = ReturnType<typeof initialState>;

function validate(state: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!state.fullName.trim()) errors.fullName = 'Enter your full name.';
  else if (state.fullName.trim().length > 200) errors.fullName = 'Use at most 200 characters.';
  if (state.phone.length > 50) errors.phone = 'Use at most 50 characters.';
  if (state.location.length > 200) errors.location = 'Use at most 200 characters.';
  if (state.summary.length > 3000) errors.summary = 'Use at most 3000 characters.';
  for (const key of ['skills', 'languages', 'certifications'] as const) {
    if (splitList(state[key]).some((item) => item.length > (key === 'certifications' ? 200 : 100))) {
      errors[key] = 'One of the entries is too long.';
    }
  }
  for (const key of ['linkedin', 'github', 'portfolio'] as const) {
    if (state[key].trim() && !safeExternalUrl(state[key])) {
      errors[key] = 'Enter a full web address starting with https://';
    }
  }
  return errors;
}

// Edits only descriptive profile fields. Email, role, applications and
// decisions are not editable here (or anywhere by the applicant).
export default function ApplicantProfileForm({
  profile,
  onSave,
  onCancel,
  isSaving,
  saveError,
}: {
  profile: ApplicantProfile;
  onSave: (update: ApplicantProfileUpdate) => void;
  onCancel: () => void;
  isSaving: boolean;
  saveError: string | null;
}) {
  const [state, setState] = useState<FormState>(() => initialState(profile));
  const [submitted, setSubmitted] = useState(false);
  const errors = validate(state);
  const showErrors = submitted ? errors : {};

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || isSaving) return;

    onSave({
      fullName: state.fullName.trim(),
      phone: orNull(state.phone),
      location: orNull(state.location),
      summary: orNull(state.summary),
      skills: splitList(state.skills),
      languages: splitList(state.languages),
      certifications: splitList(state.certifications),
      links: {
        linkedin: orNull(state.linkedin),
        github: orNull(state.github),
        portfolio: orNull(state.portfolio),
      },
      education: state.education
        .map((entry) => ({
          institution: orNull(entry.institution), degree: orNull(entry.degree),
          fieldOfStudy: orNull(entry.fieldOfStudy), startDate: orNull(entry.startDate), endDate: orNull(entry.endDate),
        }))
        .filter((entry) => Object.values(entry).some(Boolean)),
      experience: state.experience
        .map((entry) => ({
          company: orNull(entry.company), position: orNull(entry.position),
          startDate: orNull(entry.startDate), endDate: orNull(entry.endDate), description: orNull(entry.description),
        }))
        .filter((entry) => Object.values(entry).some(Boolean)),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset className="grid gap-5 md:grid-cols-2" disabled={isSaving}>
        <Field label="Full name" required error={showErrors.fullName}>
          <Input value={state.fullName} onChange={(e) => set('fullName', e.target.value)} maxLength={200} aria-invalid={Boolean(showErrors.fullName)} />
        </Field>
        <Field label="Email" hint="Your email identifies your account and cannot be changed.">
          <Input value={profile.email} readOnly className="bg-muted/50" />
        </Field>
        <Field label="Phone" error={showErrors.phone}>
          <Input value={state.phone} onChange={(e) => set('phone', e.target.value)} maxLength={50} />
        </Field>
        <Field label="Location" error={showErrors.location}>
          <Input value={state.location} onChange={(e) => set('location', e.target.value)} maxLength={200} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Professional summary" error={showErrors.summary}>
            <Textarea value={state.summary} onChange={(e) => set('summary', e.target.value)} rows={4} maxLength={3000} />
          </Field>
        </div>
        <Field label="Skills" hint="Separate with commas." error={showErrors.skills}>
          <Input value={state.skills} onChange={(e) => set('skills', e.target.value)} />
        </Field>
        <Field label="Languages" hint="Separate with commas." error={showErrors.languages}>
          <Input value={state.languages} onChange={(e) => set('languages', e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Certifications" hint="Separate with commas." error={showErrors.certifications}>
            <Input value={state.certifications} onChange={(e) => set('certifications', e.target.value)} />
          </Field>
        </div>
        <Field label="LinkedIn" error={showErrors.linkedin}>
          <Input value={state.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="https://" maxLength={500} />
        </Field>
        <Field label="GitHub" error={showErrors.github}>
          <Input value={state.github} onChange={(e) => set('github', e.target.value)} placeholder="https://" maxLength={500} />
        </Field>
        <Field label="Portfolio" error={showErrors.portfolio}>
          <Input value={state.portfolio} onChange={(e) => set('portfolio', e.target.value)} placeholder="https://" maxLength={500} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3" disabled={isSaving}>
        <ListHeader title="Education" onAdd={() => set('education', [...state.education, emptyEducation()])} disabled={state.education.length >= 30} />
        {state.education.length === 0 && <p className="text-sm text-muted-foreground">No education entries.</p>}
        {state.education.map((entry, index) => (
          <EntryCard key={index} onRemove={() => set('education', state.education.filter((_, i) => i !== index))}>
            {(['institution', 'degree', 'fieldOfStudy', 'startDate', 'endDate'] as const).map((key) => (
              <Input
                key={key}
                aria-label={EDU_LABELS[key]}
                placeholder={EDU_LABELS[key]}
                value={entry[key] ?? ''}
                maxLength={key.endsWith('Date') ? 50 : 200}
                onChange={(e) => set('education', state.education.map((item, i) => (i === index ? { ...item, [key]: e.target.value } : item)))}
              />
            ))}
          </EntryCard>
        ))}
      </fieldset>

      <fieldset className="space-y-3" disabled={isSaving}>
        <ListHeader title="Experience" onAdd={() => set('experience', [...state.experience, emptyExperience()])} disabled={state.experience.length >= 30} />
        {state.experience.length === 0 && <p className="text-sm text-muted-foreground">No experience entries.</p>}
        {state.experience.map((entry, index) => (
          <EntryCard key={index} onRemove={() => set('experience', state.experience.filter((_, i) => i !== index))}>
            {(['company', 'position', 'startDate', 'endDate'] as const).map((key) => (
              <Input
                key={key}
                aria-label={EXP_LABELS[key]}
                placeholder={EXP_LABELS[key]}
                value={entry[key] ?? ''}
                maxLength={key.endsWith('Date') ? 50 : 200}
                onChange={(e) => set('experience', state.experience.map((item, i) => (i === index ? { ...item, [key]: e.target.value } : item)))}
              />
            ))}
            <Textarea
              aria-label="Description"
              placeholder="Description"
              className="sm:col-span-2"
              rows={2}
              maxLength={3000}
              value={entry.description ?? ''}
              onChange={(e) => set('experience', state.experience.map((item, i) => (i === index ? { ...item, description: e.target.value } : item)))}
            />
          </EntryCard>
        ))}
      </fieldset>

      {submitted && Object.keys(errors).length > 0 && (
        <p role="alert" className="text-sm text-destructive">Please fix the highlighted fields.</p>
      )}
      {saveError && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{saveError}</p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save profile
        </Button>
      </div>
    </form>
  );
}

const EDU_LABELS = { institution: 'Institution', degree: 'Degree', fieldOfStudy: 'Field of study', startDate: 'Start', endDate: 'End' };
const EXP_LABELS = { company: 'Company', position: 'Position', startDate: 'Start', endDate: 'End' };

function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
      {error ? (
        <span className="block text-xs font-normal text-destructive">{error}</span>
      ) : hint ? (
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function ListHeader({ title, onAdd, disabled }: { title: string; onAdd: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={disabled} className="gap-1">
        <Plus className="h-4 w-4" /> Add
      </Button>
    </div>
  );
}

function EntryCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="grid gap-2 rounded-xl border p-4 sm:grid-cols-2">
      {children}
      <div className="flex justify-end sm:col-span-2">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="gap-1 text-destructive">
          <Trash2 className="h-4 w-4" /> Remove
        </Button>
      </div>
    </div>
  );
}
