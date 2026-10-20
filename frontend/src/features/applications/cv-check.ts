// What is known about the applicant's CV before they submit (Apply and
// Application Review pages show the same feedback).
//
//   checking     the check is running
//   checked      duplicate: this CV file was already submitted with an
//                  application (any training), so it cannot be used again
//                previouslyUploaded: the same file was uploaded before for
//                  any application, drafts included (warning only)
//   failed       the check could not be completed (never treated as clear)
//   unavailable  the CV cannot be checked in advance; the server checks it
//                when it is submitted
export type CvCheckView =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'checked'; duplicate: boolean | null; previouslyUploaded: boolean }
  | { status: 'failed' }
  | { status: 'unavailable' };

// The CV rule: only a CV checked as not already submitted (or one that can
// only be checked by the server on submission) may be submitted. An earlier
// upload that was never submitted is a warning, not a refusal.
export function cvCheckAllowsSubmit(view: CvCheckView): boolean {
  return (view.status === 'checked' && view.duplicate === false) || view.status === 'unavailable';
}
