import type {
  ApplicationStatus,
} from '@/features/applications/types';

export interface HrDashboardStats {
  totalApplications: number;
  pendingReview: number;
  activeInternships: number;
  upcomingInterviews: number;
}

export interface HrDashboardPipelineItem {
  status: string;
  label: string;
  count: number;
}

export interface HrDashboardApplication {
  id: string;
  applicantName: string;
  internshipTitle: string;
  status: ApplicationStatus;
  createdAt: string;
}

export interface HrDashboardInterview {
  id: string;
  applicantName: string;
  internshipTitle: string;
  scheduledAt: string;
  status: string;
}

export interface TrainingDemandItem {
  name: string;

  type:
    | 'INTERNSHIP'
    | 'OTHER';

  count: number;
}

export interface TrainingDemandResponse {
  totalRequests: number;

  items:
    TrainingDemandItem[];
}

export interface HrDashboardData {
  stats:
    HrDashboardStats;

  pipeline:
    HrDashboardPipelineItem[];

  trainingDemand:
    TrainingDemandResponse;

  recentApplications:
    HrDashboardApplication[];

  upcomingInterviewList:
    HrDashboardInterview[];
}