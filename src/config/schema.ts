export const COLLECTIONS = { 
  USERS: 'users', 
  EMPLOYEES: 'employees', 
  CLIENTS: 'clients', 
  PROJECTS: 'projects', 
  APPS: 'apps', 
  SCOPES: 'scopes', 
  PRICING_RULES: 'pricingRules', 
  COMMISSION_RULES: 'commissionRules', 
  PACKAGE_PLANS: 'packagePlans',
  PROPOSALS: 'proposals', 
  CHANGE_REQUESTS: 'changeRequests', 
  PRICING_CATEGORIES: 'pricingCategories',
  PASSWORD_RESET_REQUESTS: 'passwordResetRequests',
  APPROVALS: 'approvals',
  DEPARTMENTS: 'departments'
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

export interface PricingCategoryHistoryEntry {
  category: string;
  effectiveFrom: string; // ISO date string
  effectiveTo?: string | null; // ISO date string or null if currently active
  updatedBy?: string;
  updatedAt?: string;
  reason?: string;
}

export interface ClientSubscriptionPlan {
  planId: string;
  scopeCovered: string; // e.g. "Pre Design", "Post Design"
  projectsPerMonth: number;
  durationMonths: number;
  upfrontPrice: number;
  bonusProjects: number;
  totalAllowedProjects: number;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  status: 'active' | 'expired' | 'cancelled';
}

export type CommercialModel = 'PER_KW' | 'FIXED_PACKAGE';

export const CLIENT_STATUS = { PENDING: 'pending_approval', APPROVED: 'approved', REJECTED: 'rejected' } as const;
export const PROJECT_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  REQUIRED_DATA_PENDING: 'required_data_pending',
  IN_REVISION: 'in_revision',
  IN_VERIFICATION: 'in_verification',
  DELAYED: 'delayed',
  COMPLETED: 'completed'
} as const;
export const CLIENT_FIELDS = { 
  COMPANY_NAME: 'companyName', 
  CONTACT_PERSON: 'contactPerson', 
  EMAIL: 'email', 
  PHONE: 'phone', 
  CITY: 'city', 
  GSTIN: 'gstin', 
  PRICING_CATEGORY: 'pricingCategory', 
  SALES_PERSON_EMAIL: 'salesPersonEmail', 
  PROPOSAL_NUMBER: 'proposalNumber', 
  STATUS: 'status', 
  COMMERCIAL_MODEL: 'commercialModel',
  SUBSCRIPTION_PLAN: 'subscriptionPlan',
  PRICING_CATEGORY_HISTORY: 'pricingCategoryHistory',
  CREATED_AT: 'createdAt' 
} as const;
export const PROJECT_FIELDS = { PROJECT_NUMBER: 'projectNumber', PROJECT_NAME: 'projectName', CLIENT_ID: 'clientId', CLIENT_NAME: 'clientName', SCOPE_OF_WORK: 'scopeOfWork', SUB_SERVICE: 'subService', PLANT_CAPACITY: 'plantCapacity', CAPACITY_UNIT: 'capacityUnit', LOCATION: 'location', DESIGNER_EMAIL: 'designerEmail', PRICING_CATEGORY: 'pricingCategory', STATUS: 'status', CREATED_AT: 'createdAt', UPDATED_AT: 'updatedAt' } as const;

