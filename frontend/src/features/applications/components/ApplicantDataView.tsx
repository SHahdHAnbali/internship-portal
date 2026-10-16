import type { ReactNode } from 'react';

import {
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react';

import { cvItemText, cvTextList } from '@/features/applications/cv-text';
import type { ExtractedCvData } from '@/features/applications/types';
import { safeExternalUrl } from '@/lib/safe-url';

const LINK_LABELS: Record<keyof ExtractedCvData['links'], string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
};

// Read-only rendering of one version of an applicant's CV data. Values go
// through cvItemText/cvTextList because stored extractions may hold structured
// entries (e.g. { language, proficiency }) that React cannot render.
export default function ApplicantDataView({
  data,
  fallbackName,
  fallbackEmail,
}: {
  data: ExtractedCvData | null;
  fallbackName?: string | null;
  fallbackEmail?: string | null;
}) {
  if (!data) {
    return <p className="text-sm text-muted-foreground">No applicant data is available.</p>;
  }

  const links = (Object.keys(LINK_LABELS) as Array<keyof ExtractedCvData['links']>)
    .map((key) => ({ key, label: LINK_LABELS[key], raw: cvItemText(data.links?.[key]) }))
    .filter((link) => link.raw);

  const education = entries(data.education, ['institution', 'degree', 'fieldOfStudy', 'startDate', 'endDate']);
  const experience = entries(data.experience, ['company', 'position', 'startDate', 'endDate', 'description']);

  return (
    <div className="space-y-7">
      <section className="grid gap-5 sm:grid-cols-2">
        <Info icon={<User className="h-4 w-4" />} label="Full name" value={cvItemText(data.fullName) ?? fallbackName} />
        <Info icon={<Mail className="h-4 w-4" />} label="Email" value={cvItemText(data.email) ?? fallbackEmail} />
        <Info icon={<Phone className="h-4 w-4" />} label="Phone" value={cvItemText(data.phone)} />
        <Info icon={<MapPin className="h-4 w-4" />} label="Location" value={cvItemText(data.location)} />
      </section>

      <Section title="Professional summary">
        {cvItemText(data.summary) ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{cvItemText(data.summary)}</p>
        ) : (
          <Empty>No summary provided.</Empty>
        )}
      </Section>

      <Section title="Skills">
        <Chips items={data.skills} empty="No skills listed." />
      </Section>

      <div className="grid gap-7 sm:grid-cols-2">
        <Section title="Languages">
          <Chips items={data.languages} empty="No languages listed." />
        </Section>
        <Section title="Certifications">
          <Chips items={data.certifications} empty="No certifications listed." />
        </Section>
      </div>

      <Section title="Professional profiles">
        {links.length === 0 ? (
          <Empty>No profile links provided.</Empty>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => {
              const href = safeExternalUrl(link.raw);
              return (
                <li key={link.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-20 shrink-0 text-muted-foreground">{link.label}</span>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 break-all font-medium text-[#3F72AF] hover:underline"
                    >
                      {link.raw}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    // Not a valid http(s) URL: shown as text, never as a link.
                    <span className="break-all text-muted-foreground">{link.raw} (not a valid web link)</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Education">
        {education.length ? (
          <div className="space-y-3">
            {education.map((item, index) => (
              <div key={index} className="rounded-lg border p-4">
                <p className="font-medium">{item.degree || item.fieldOfStudy || 'Education'}</p>
                {item.degree && item.fieldOfStudy && (
                  <p className="text-sm text-muted-foreground">{item.fieldOfStudy}</p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">{item.institution}</p>
                <Period start={item.startDate} end={item.endDate} />
              </div>
            ))}
          </div>
        ) : (
          <Empty>No education information.</Empty>
        )}
      </Section>

      <Section title="Experience">
        {experience.length ? (
          <div className="space-y-3">
            {experience.map((item, index) => (
              <div key={index} className="rounded-lg border p-4">
                <p className="font-medium">{item.position || 'Position'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.company}</p>
                <Period start={item.startDate} end={item.endDate} />
                {item.description && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No experience information.</Empty>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

// Education/experience entries with every field reduced to display text.
function entries<K extends string>(value: unknown, keys: readonly K[]): Array<Record<K, string | null>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => Object.fromEntries(keys.map((key) => [key, cvItemText(item[key])])) as Record<K, string | null>);
}

function Chips({ items: raw, empty }: { items: unknown; empty: string }) {
  const items = cvTextList(raw);
  if (!items.length) {
    return <Empty>{empty}</Empty>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="rounded-full border px-3 py-1 text-sm">{item}</span>
      ))}
    </div>
  );
}

function Period({ start, end }: { start: string | null; end: string | null }) {
  if (!start && !end) return null;
  return <p className="mt-2 text-xs text-muted-foreground">{start ?? '?'} — {end ?? 'present'}</p>;
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-medium">{value || '—'}</p>
      </div>
    </div>
  );
}
