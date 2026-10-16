export interface ApplicationMatch {
    overallScore: number;
  
    skillsScore: number;
    educationScore: number;
    experienceScore: number;
    languagesScore: number;
  
    matchedRequirements: string[];
    missingRequirements: string[];
  
    strengths: string[];
    gaps: string[];
  }