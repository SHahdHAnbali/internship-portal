import { ApplicationStatus } from '../enums/application-status.enum.js';

// A submitted application as listed for HR. Never carries CV storage paths.
export class Application {
  constructor(
    public readonly id: string,
    public readonly applicantName: string,
    public readonly applicantEmail: string,
    public readonly internshipTitle: string,
    // Initial CV upload time (draft creation).
    public readonly appliedAt: Date,
    // Applicant's final review submission time; null only for legacy rows.
    public readonly submittedAt: Date | null,
    public readonly status: ApplicationStatus,
    public readonly hasCv: boolean,
  ) {}
}
