export const COLLECTIONS = {
  USERS: 'users',
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  APPS: 'apps',
  SCOPES: 'scopes',
  PRICING_RULES: 'pricingRules',
  PROPOSALS: 'proposals',
  PRICING_CATEGORIES: 'pricingCategories', // Adding this as it's used
  USER_ACCESS: 'userAccess', // Adding this as it's used
} as const;

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
