export interface ExtractedCvData {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    summary: string | null;
  
    education: Array<{
      institution: string | null;
      degree: string | null;
      fieldOfStudy: string | null;
      startDate: string | null;
      endDate: string | null;
    }>;
  
    experience: Array<{
      company: string | null;
      position: string | null;
      startDate: string | null;
      endDate: string | null;
      description: string | null;
    }>;
  
    skills: string[];
    languages: string[];
    certifications: string[];
  
    links: {
      linkedin: string | null;
      github: string | null;
      portfolio: string | null;
    };
  }