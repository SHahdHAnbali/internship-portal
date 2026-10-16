export interface InternshipRequirements {
    id: string;
    internshipId: string;
  
    requiredSkills: string[];
    preferredSkills: string[];
  
    minimumEducation: string | null;
    minimumExperienceYears: number | null;
  
    languages: string[];
    certifications: string[];
  
    otherRequirements: string | null;
  
    createdAt: string;
    updatedAt: string;
  }