import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { hrInternshipsKey, trainingPlanKey } from '@/features/internships/hooks/useInternships';
import { createInternship } from '@/features/internships/services/internships.service';
import {
  SELECTION_STATUS_HINTS,
  SELECTION_STATUS_LABELS,
  SELECTION_STATUS_STYLES,
} from '@/features/internships/selection-status';
import {
  getTrainingPlan,
  mapTrainingRequest,
  unmapTrainingRequest,
  updateTrainingOpportunity,
} from '@/features/internships/services/training-planning.service';
import type {
  DemandBreakdown,
  PlannedOpportunity,
  PlanningChange,
  SelectionStatus,
  SkillCount,
  UnmatchedRequest,
} from '@/features/internships/types';

import { LinkRequestDialog, OpportunityDialog, type OpportunityFormValues } from './PlanningDialogs';

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create'; fromRequest?: UnmatchedRequest }
  | { mode: 'edit'; opportunity: PlannedOpportunity };

// HR planning: demand per training, seats, and linking "Other" requests.
// Figures are computed from real applications; HR makes every decision.
export default function TrainingPlanning() {
  const queryClient = useQueryClient();
  const plan = useQuery({ queryKey: trainingPlanKey, queryFn: getTrainingPlan });
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [linkLabel, setLinkLabel] = useState<UnmatchedRequest | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trainingPlanKey }),
      queryClient.invalidateQueries({ queryKey: hrInternshipsKey }),
    ]);
  }

  const saveOpportunity = useMutation({
    mutationFn: async (values: OpportunityFormValues) => {
      if (editor.mode === 'edit') {
        return updateTrainingOpportunity(editor.opportunity.id, values);
      }
      const created = await createInternship({
        title: values.title,
        capacity: values.capacity,
        note: values.note,
        isActive: values.isActive,
        selectionStatus: values.selectionStatus === 'CLOSED' ? 'NOT_APPROVED' : values.selectionStatus,
      });
      if (editor.mode === 'create' && editor.fromRequest) {
        await mapTrainingRequest(editor.fromRequest.normalizedLabel, created.id, values.note);
      }
      return created;
    },
    onSuccess: async () => {
      setEditor({ mode: 'closed' });
      await refresh();
    },
    // A created opportunity that could not be linked still exists: refresh.
    onError: () => void refresh(),
  });

  const link = useMutation({
    mutationFn: ({ label, internshipId, note }: { label: string; internshipId: string; note: string | null }) =>
      mapTrainingRequest(label, internshipId, note),
    onSuccess: async () => {
      setLinkLabel(null);
      await refresh();
    },
  });

  // Quick approval actions keep every other field as it is.
  const changeStatus = useMutation({
    mutationFn: ({ opportunity, status }: { opportunity: PlannedOpportunity; status: SelectionStatus }) =>
      updateTrainingOpportunity(opportunity.id, {
        title: opportunity.title,
        isActive: opportunity.isActive,
        capacity: opportunity.capacity,
        selectionStatus: status,
      }),
    onMutate: () => setUnlinkError(null),
    onSuccess: refresh,
    onError: (error) => setUnlinkError(error.message),
  });

  const unlink = useMutation({
    mutationFn: (label: string) => unmapTrainingRequest(label, null),
    onMutate: () => setUnlinkError(null),
    onSuccess: refresh,
    onError: (error) => setUnlinkError(error.message),
  });

  if (plan.isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#3F72AF]" />
      </div>
    );
  }

  if (plan.isError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="flex-1 text-sm">{plan.error.message}</p>
            <Button variant="outline" onClick={() => void plan.refetch()} className="gap-2">
              <RotateCw className="h-4 w-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { opportunities, unmatchedRequests, totals, recentChanges } = plan.data;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1600px] space-y-8 p-6 lg:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#112D4E]">Training planning</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Applicants request trainings first. Review that demand, approve the trainings the organization can offer, then set
              how many applicants each may select. Counts are informational; every approval and selection is an HR decision.
            </p>
          </div>
          <Button onClick={() => { saveOpportunity.reset(); setEditor({ mode: 'create' }); }} className="gap-2">
            <Plus className="h-4 w-4" /> New opportunity
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Stat label="Submitted applications" value={totals.total} />
          <Stat label="In review" value={totals.inReview} />
          <Stat label="Selected" value={totals.selected} />
          <Stat label="Planned seats" value={totals.plannedCapacity} hint={`${totals.remainingSeats} remaining`} />
          <Stat label="Awaiting approval" value={totals.awaitingApproval} warn={totals.awaitingApproval > 0} />
          <Stat label="Approved without capacity" value={totals.unplannedOpportunities} warn={totals.unplannedOpportunities > 0} />
        </div>

        {unlinkError && (
          <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{unlinkError}</p>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-[#112D4E]">Training opportunities</h2>
          {opportunities.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-slate-500">No training opportunities yet. Create one to start planning.</CardContent></Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {opportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  onEdit={() => { saveOpportunity.reset(); setEditor({ mode: 'edit', opportunity }); }}
                  onChangeStatus={(status) => changeStatus.mutate({ opportunity, status })}
                  changingStatus={changeStatus.isPending && changeStatus.variables?.opportunity.id === opportunity.id}
                  onUnlink={(label) => unlink.mutate(label)}
                  unlinking={unlink.isPending ? unlink.variables : null}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#112D4E]">Requested trainings not yet linked</h2>
            <p className="mt-1 text-sm text-slate-500">
              Applicants chose “Other” and named these trainings. Link each to an opportunity (or create one) before selecting those applicants.
            </p>
          </div>
          {unmatchedRequests.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-slate-500">Every requested training is linked to an opportunity.</CardContent></Card>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <ul className="divide-y">
                  {unmatchedRequests.map((request) => (
                    <li key={request.normalizedLabel} className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <p className="font-medium text-[#112D4E]">{request.label}</p>
                        <DemandLine demand={request.demand} />
                        <SkillChips skills={request.topSkills} empty="No skills listed by these applicants." />
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" disabled={opportunities.length === 0}
                          onClick={() => { link.reset(); setLinkLabel(request); }}>
                          <Link2 className="h-4 w-4" /> Link to opportunity
                        </Button>
                        <Button size="sm" className="gap-1.5"
                          onClick={() => { saveOpportunity.reset(); setEditor({ mode: 'create', fromRequest: request }); }}>
                          <Plus className="h-4 w-4" /> Create from request
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-[#112D4E]">Planning history</h2>
          <PlanningHistory changes={recentChanges} />
        </section>
      </div>

      <OpportunityDialog
        open={editor.mode !== 'closed'}
        opportunity={editor.mode === 'edit' ? editor.opportunity : null}
        initialTitle={editor.mode === 'create' ? editor.fromRequest?.label : undefined}
        isSaving={saveOpportunity.isPending}
        error={saveOpportunity.isError ? saveOpportunity.error.message : null}
        onSubmit={(values) => saveOpportunity.mutate(values)}
        onClose={() => setEditor({ mode: 'closed' })}
      />

      <LinkRequestDialog
        key={linkLabel?.normalizedLabel ?? 'none'}
        label={linkLabel?.label ?? null}
        opportunities={opportunities}
        isSaving={link.isPending}
        error={link.isError ? link.error.message : null}
        onSubmit={(internshipId, note) => linkLabel && link.mutate({ label: linkLabel.normalizedLabel, internshipId, note })}
        onClose={() => setLinkLabel(null)}
      />
    </div>
  );
}

function OpportunityCard({
  opportunity,
  onEdit,
  onChangeStatus,
  changingStatus,
  onUnlink,
  unlinking,
}: {
  opportunity: PlannedOpportunity;
  onEdit: () => void;
  onChangeStatus: (status: SelectionStatus) => void;
  changingStatus: boolean;
  onUnlink: (label: string) => void;
  unlinking: string | null | undefined;
}) {
  const { seats } = opportunity;
  const used = seats.capacity ? Math.min(100, Math.round((seats.consumed / seats.capacity) * 100)) : 0;

  return (
    <Card className={opportunity.selectionStatus === 'CLOSED' ? 'opacity-80' : ''}>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-[#112D4E]">{opportunity.title}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="outline" className={SELECTION_STATUS_STYLES[opportunity.selectionStatus]} title={SELECTION_STATUS_HINTS[opportunity.selectionStatus]}>
                {SELECTION_STATUS_LABELS[opportunity.selectionStatus]}
              </Badge>
              <Badge variant="outline" className={opportunity.isActive ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}>
                {opportunity.isActive ? 'Listed for applicants' : 'Not listed'}
              </Badge>
              {seats.capacity === null && opportunity.selectionStatus !== 'NOT_APPROVED' && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700">Capacity not set</Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {opportunity.selectionStatus === 'NOT_APPROVED' && (
              <Button size="sm" disabled={changingStatus} onClick={() => onChangeStatus('OPEN')}>Approve</Button>
            )}
            {opportunity.selectionStatus === 'OPEN' && (
              <Button variant="outline" size="sm" disabled={changingStatus} onClick={() => onChangeStatus('CLOSED')}>Close selection</Button>
            )}
            {opportunity.selectionStatus === 'CLOSED' && (
              <Button variant="outline" size="sm" disabled={changingStatus} onClick={() => onChangeStatus('OPEN')}>Reopen selection</Button>
            )}
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium"><Users className="h-4 w-4" /> Seats</span>
            <span className="text-slate-600">
              {seats.capacity === null
                ? `${seats.consumed} consumed · capacity not set`
                : `${seats.consumed} of ${seats.capacity} consumed · ${seats.remaining} remaining`}
            </span>
          </div>
          {seats.capacity !== null && (
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${used >= 100 ? 'bg-amber-500' : 'bg-[#3F72AF]'}`} style={{ width: `${used}%` }} />
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
            <div><dt className="text-slate-500">Capacity</dt><dd className="font-medium">{seats.capacity ?? 'Not set'}</dd></div>
            <div><dt className="text-slate-500">Total selected</dt><dd className="font-medium">{seats.selected}</dd></div>
            <div><dt className="text-slate-500">Released</dt><dd className="font-medium">{seats.released}</dd></div>
            <div><dt className="text-slate-500">Remaining</dt><dd className="font-medium">{seats.remaining ?? '—'}</dd></div>
          </dl>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <CalendarClock className="h-3.5 w-3.5" />
            Placements: {seats.scheduledPlacements} scheduled, {seats.activePlacements} active, {seats.completedPlacements} completed.
            Completed and cancelled placements keep their seat.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Demand</p>
          <DemandLine demand={opportunity.demand} />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Required skills among applicants</p>
          {!opportunity.hasRequirements ? (
            <p className="text-xs text-slate-500">No requirements defined yet (set them on the Internships page).</p>
          ) : opportunity.requiredSkillCoverage.length === 0 ? (
            <p className="text-xs text-slate-500">No required skills listed.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {opportunity.requiredSkillCoverage.map((coverage) => (
                <span key={coverage.skill} className="rounded-full border px-2.5 py-0.5 text-xs">
                  {coverage.skill}: <span className="font-medium">{coverage.applicants}</span> of {opportunity.demand.total}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Common applicant skills</p>
          <SkillChips skills={opportunity.topSkills} empty="No applicant skills yet." />
        </div>

        {opportunity.mappedRequests.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Linked “Other” requests</p>
            <ul className="flex flex-wrap gap-2">
              {opportunity.mappedRequests.map((label) => (
                <li key={label} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-2.5 text-xs">
                  {label}
                  <button
                    type="button"
                    onClick={() => onUnlink(label)}
                    disabled={unlinking === label}
                    aria-label={`Unlink ${label}`}
                    className="rounded-full p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50"
                  >
                    {unlinking === label ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DemandLine({ demand }: { demand: DemandBreakdown }) {
  return (
    <p className="text-sm text-slate-600">
      <span className="font-medium text-[#112D4E]">{demand.total}</span> submitted ·{' '}
      {demand.inReview} in review · {demand.selected} selected · {demand.rejected} rejected
    </p>
  );
}

function SkillChips({ skills, empty }: { skills: SkillCount[]; empty: string }) {
  if (skills.length === 0) return <p className="text-xs text-slate-500">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <span key={skill.skill} className="rounded-full border bg-white px-2.5 py-0.5 text-xs">
          {skill.skill} <span className="text-slate-500">· {skill.applicants}</span>
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  return (
    <Card className={warn ? 'border-amber-200' : ''}>
      <CardContent className="p-5">
        <p className="text-sm text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${warn ? 'text-amber-700' : 'text-[#112D4E]'}`}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const CHANGE_LABELS: Record<PlanningChange['type'], string> = {
  OPPORTUNITY_CREATED: 'Opportunity created',
  OPPORTUNITY_UPDATED: 'Opportunity updated',
  REQUEST_MAPPED: 'Request linked',
  REQUEST_UNMAPPED: 'Request unlinked',
  SELECTION_RELEASED: 'Selection released (seat freed)',
};

function describeChange(change: PlanningChange): string {
  const details = change.details as Record<string, { from?: unknown; to?: unknown } | unknown>;
  if (change.type === 'OPPORTUNITY_UPDATED') {
    return Object.entries(details)
      .map(([field, value]) => {
        const { from, to } = (value ?? {}) as { from?: unknown; to?: unknown };
        if (field === 'selectionStatus') {
          const label = (value: unknown) => SELECTION_STATUS_LABELS[value as SelectionStatus] ?? String(value ?? '—');
          return `selection: ${label(from)} → ${label(to)}`;
        }
        const name = field === 'isActive' ? 'listed for applicants' : field;
        return `${name}: ${String(from ?? '—')} → ${String(to ?? '—')}`;
      })
      .join('; ');
  }
  if (change.type === 'OPPORTUNITY_CREATED') {
    const { capacity, selectionStatus } = details as { capacity?: unknown; selectionStatus?: unknown };
    const status = SELECTION_STATUS_LABELS[selectionStatus as SelectionStatus];
    return `capacity ${capacity === null || capacity === undefined ? 'not set' : String(capacity)}${status ? ` · ${status.toLowerCase()}` : ''}`;
  }
  if (change.type === 'SELECTION_RELEASED') {
    return 'An applicant’s selection was released; the application stays selected and cannot be placed again.';
  }
  return change.requestLabel ? `“${change.requestLabel}”` : '';
}

function PlanningHistory({ changes }: { changes: PlanningChange[] }) {
  if (changes.length === 0) {
    return <Card><CardContent className="p-6 text-sm text-slate-500">No planning changes recorded yet.</CardContent></Card>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {changes.map((change) => (
            <li key={change.id} className="flex flex-col gap-1 p-4 text-sm sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium">
                  {CHANGE_LABELS[change.type]}{change.internshipTitle ? ` · ${change.internshipTitle}` : ''}
                </p>
                <p className="text-slate-600">{describeChange(change)}</p>
                {change.note && <p className="mt-1 text-slate-500">Note: {change.note}</p>}
              </div>
              <p className="shrink-0 text-xs text-slate-500">
                {change.actorName ?? 'HR'} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(change.createdAt))}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
