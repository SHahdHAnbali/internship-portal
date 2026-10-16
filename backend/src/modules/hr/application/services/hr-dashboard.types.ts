import type {
  TrainingDemandResponse,
} from './training-demand.types.js';

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
  status: string;
  createdAt: string;
}

export interface HrDashboardInterview {
  id: string;
  applicantName: string;
  internshipTitle: string;
  scheduledAt: string;
  status: string;
}

export interface HrDashboardResponse {
  stats: HrDashboardStats;

  pipeline: HrDashboardPipelineItem[];

  trainingDemand: TrainingDemandResponse;

  recentApplications:
    HrDashboardApplication[];

  upcomingInterviewList:
    HrDashboardInterview[];
}