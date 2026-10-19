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
  packageType?: string; // One of the 7 standard package types (Basic Retainer, Premium Engineering, Turnkey Drawing, CEIG Retainer, Detail Design Package, Express Modeling, Complete Annual Retainer) or custom
  scopeCovered: string; // e.g. "Pre Design", "Post Design"
  projectsPerMonth: number;
  durationMonths: number;
  upfrontPrice: number;
  bonusProjects: number;
  totalAllowedProjects: number;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  status: 'active' | 'expired' | 'cancelled';
  packageSalesIncentive?: number; // Flat ₹500 per 100% paid package invoice
}

export type CommercialModel = 'PER_KW' | 'FIXED_PACKAGE';

export interface StandardPackageTypeConfig {
  id: string;
  name: string;
  scope: string;
  defaultProjectsPerMonth: number;
  defaultDurationMonths: number;
  defaultUpfrontPrice: number;
  defaultBonusProjects: number;
  description: string;
}

export const PACKAGE_SALES_INCENTIVE_DEFAULT = 500; // Flat ₹500 per 100% paid package invoice
export const PACKAGE_QUOTA_DELIVERABLE_COMMISSION_TAG = 'package_quota_deliverable'; // Individual quota deliverables carry ₹0 project-level sales commission

export const STANDARD_7_PACKAGE_TYPES: StandardPackageTypeConfig[] = [
  {
    id: 'basic_retainer',
    name: 'Basic Retainer',
    scope: 'Pre Design',
    defaultProjectsPerMonth: 100,
    defaultDurationMonths: 1,
    defaultUpfrontPrice: 25000,
    defaultBonusProjects: 0,
    description: 'Entry-level pre-design monthly retainer quota'
  },
  {
    id: 'premium_engineering',
    name: 'Premium Engineering',
    scope: 'Post Design',
    defaultProjectsPerMonth: 100,
    defaultDurationMonths: 3,
    defaultUpfrontPrice: 75000,
    defaultBonusProjects: 15,
    description: 'Comprehensive post-design engineering retainer with bonus deliverables'
  },
  {
    id: 'turnkey_drawing',
    name: 'Turnkey Drawing',
    scope: 'Detailed Engineering',
    defaultProjectsPerMonth: 50,
    defaultDurationMonths: 3,
    defaultUpfrontPrice: 60000,
    defaultBonusProjects: 5,
    description: 'End-to-end electrical & structural CAD drawings'
  },
  {
    id: 'ceig_retainer',
    name: 'CEIG Retainer',
    scope: 'CEIG Approval',
    defaultProjectsPerMonth: 30,
    defaultDurationMonths: 3,
    defaultUpfrontPrice: 45000,
    defaultBonusProjects: 3,
    description: 'Statutory CEIG electrical inspectorate drawings & documentation'
  },
  {
    id: 'detail_design_package',
    name: 'Detail Design Package',
    scope: 'Pre Design + Post Design',
    defaultProjectsPerMonth: 150,
    defaultDurationMonths: 6,
    defaultUpfrontPrice: 180000,
    defaultBonusProjects: 25,
    description: 'Multi-service turnkey design package covering pre & post engineering'
  },
  {
    id: 'express_modeling',
    name: 'Express Modeling',
    scope: 'PVsyst Simulation',
    defaultProjectsPerMonth: 80,
    defaultDurationMonths: 1,
    defaultUpfrontPrice: 35000,
    defaultBonusProjects: 5,
    description: 'High-speed 3D shading & PVsyst energy generation simulations'
  },
  {
    id: 'complete_annual_retainer',
    name: 'Complete Annual Retainer',
    scope: 'Full Scope Turnkey',
    defaultProjectsPerMonth: 200,
    defaultDurationMonths: 12,
    defaultUpfrontPrice: 500000,
    defaultBonusProjects: 60,
    description: 'Year-long enterprise subscription with guaranteed priority turnaround'
  }
];

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
  ORIGINAL_SALES_PERSON_EMAIL: 'originalSalesPersonEmail',
  PROPOSAL_NUMBER: 'proposalNumber', 
  STATUS: 'status', 
  COMMERCIAL_MODEL: 'commercialModel',
  SUBSCRIPTION_PLAN: 'subscriptionPlan',
  PRICING_CATEGORY_HISTORY: 'pricingCategoryHistory',
  CREATED_AT: 'createdAt' 
} as const;
export const PROJECT_FIELDS = { PROJECT_NUMBER: 'projectNumber', PROJECT_NAME: 'projectName', CLIENT_ID: 'clientId', CLIENT_NAME: 'clientName', SCOPE_OF_WORK: 'scopeOfWork', SUB_SERVICE: 'subService', PLANT_CAPACITY: 'plantCapacity', CAPACITY_UNIT: 'capacityUnit', LOCATION: 'location', DESIGNER_EMAIL: 'designerEmail', PRICING_CATEGORY: 'pricingCategory', STATUS: 'status', CREATED_AT: 'createdAt', UPDATED_AT: 'updatedAt' } as const;

