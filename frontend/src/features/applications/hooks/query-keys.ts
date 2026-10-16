// TanStack Query keys shared by the HR application pages.
export const hrApplicationsKey = ['hr', 'applications'] as const;

export const applicationDetailsKey = (id: string) => ['hr', 'application', id] as const;

export const applicationPlacementKey = (id: string) => ['hr', 'application-placement', id] as const;
