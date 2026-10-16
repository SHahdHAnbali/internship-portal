export interface TrainingDemandItem {
    name: string;
    type: 'INTERNSHIP' | 'OTHER';
    count: number;
  }
  
  export interface TrainingDemandResponse {
    totalRequests: number;
    items: TrainingDemandItem[];
  }