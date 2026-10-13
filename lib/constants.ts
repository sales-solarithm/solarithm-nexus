export const COLLECTIONS = {
  USERS: 'users',
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  APPS: 'apps',
  SCOPES: 'scopes',
  PRICING_RULES: 'pricingRules',
  COMMISSION_RULES: 'commissionRules',
  PACKAGE_PLANS: 'packagePlans',
  PROPOSALS: 'proposals',
  PRICING_CATEGORIES: 'pricingCategories', // Adding this as it's used
  USER_ACCESS: 'userAccess', // Adding this as it's used
} as const;

export interface PackagePlanDocument {
  id: string; // e.g. "pre_design_100_3m"
  scope: string; // "Pre Design" | "Post Design" | dynamic
  projectsPerMonth: number; // 100, 200, 300
  durationMonths: number; // 1, 3, 6
  upfrontPrice: number; // e.g. 25000, 70000, 130000
  bonusProjects: number; // e.g. 0, 15, 20
  totalAllowedProjects: number; // (projectsPerMonth * durationMonths) + bonusProjects
  status: 'active' | 'inactive';
  updatedAt: string;
  createdAt?: string;
}


export const STATUS = {
  // Client Statuses (MUST BE LOWERCASE)
  CLIENT_PENDING: 'pending_approval',
  CLIENT_APPROVED: 'approved',
  CLIENT_REJECTED: 'rejected',
  // Project Statuses (MUST BE LOWERCASE)
  PROJECT_NOT_STARTED: 'not_started',
  PROJECT_IN_PROGRESS: 'in_progress',
  PROJECT_PENDING_DESIGN: 'pending_design_approval',
  PROJECT_DESIGN_APPROVED: 'design_approved',
} as const;

export const FIELDS = {
  // Client Fields
  COMPANY_NAME: 'companyName',
  CONTACT_PERSON: 'contactPerson',
  PRICING_CATEGORY: 'pricingCategory',
  SALES_PERSON_EMAIL: 'salesPersonEmail',
  PROPOSAL_NUMBER: 'proposalNumber',
  STATUS: 'status',
  CREATED_AT: 'createdAt',
  // Project Fields
  PROJECT_NUMBER: 'projectNumber',
  SCOPE_OF_WORK: 'scopeOfWork',
  SUB_SERVICE: 'subService',
  PLANT_CAPACITY: 'plantCapacity',
  DESIGNER_EMAIL: 'designerEmail',
  // User/App Fields
  ROLE: 'role',
  ACCESSIBLE_APPS: 'accessibleApps',
} as const;
