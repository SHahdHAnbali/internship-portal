# Mentor evaluations: retention and deletion

This document describes how the current implementation keeps evaluation data and what that
means for deletion requests. It does not define retention periods and does not change any
deletion behaviour.

## What is stored

- `intern_evaluations`: the Mentor's working text, the published snapshot the intern sees, the
  original author, the last editor, the publisher of the visible version, revisions and times.
- `intern_evaluation_events`: one metadata-only audit event per change (created, updated,
  published) with the actor and time. Events never contain evaluation text.
- Unsaved text may also exist temporarily in a Mentor's own browser tab (`sessionStorage`); it
  is never sent to the server and disappears when the tab is closed or the text is saved or
  discarded.

## Why evaluation records can prevent account deletion

Evaluations and their audit events reference the Mentor profiles that wrote, edited and
published them, and the placement they belong to. These foreign keys are `ON DELETE RESTRICT`.
As a result:

- deleting a profile (or the Auth user, which would cascade to the profile) of a Mentor who
  authored, edited or published an evaluation, or acted in its audit events, fails;
- deleting a placement that has evaluations fails.

This is intentional: silently removing or re-attributing evaluations or their audit trail would
falsify the record of who wrote and published what. The portal itself never deletes these
accounts (it deactivates staff accounts instead), and no app workflow deletes placements.

## Account deletion, evaluation deletion and audit retention are different things

- **Deactivating an account** (the normal portal workflow) ends access and keeps all records.
- **Deleting an account** would remove the person's profile; it is blocked while evaluations
  or audit events reference it.
- **Deleting an evaluation** is not possible in the portal (no delete function, no delete
  privilege). Completion of a placement neither publishes nor deletes evaluations.
- **Audit events** are append-only metadata and are kept with the evaluation.

## Handling a deletion or erasure request

1. Route the request to the organisation's responsible data owner (and legal counsel where
   required). Portal developers and administrators must not resolve it on their own.
2. Identify the records involved (evaluations authored, edited or published by the person;
   evaluations about an intern) using read-only queries by an authorized operator.
3. The responsible owner decides, under the applicable law and the organisation's policy,
   whether records must be kept, restricted, anonymized or deleted.
4. Any change to the data is carried out as a separate, reviewed and approved operation, with a
   record of who approved it. It must keep authorization rules and audit integrity intact.

## Retention periods

No retention period is defined or implemented. Retention periods must be explicitly approved by
the responsible organisation or legal owner; none is invented here.

## What this implementation does not do

- No automatic deletion, expiry or anonymization of evaluations or audit events.
- No cascading deletion from accounts or placements to evaluations.
- No account-deletion workflow.

## Future changes

Any future retention, anonymization or deletion feature needs explicit product and legal
approval and must:

- keep HR and ADMIN without access to evaluation content and metadata unless that is decided;
- keep the audit trail consistent (no rewriting of who wrote or published what);
- be implemented as a reviewed migration and backend workflow with its own tests;
- satisfy the applicable legal requirements for the data concerned.
