export const COLLECTIONS = {
  USERS: 'users', CLIENTS: 'clients', PROJECTS: 'projects',
  APPS: 'apps', SCOPES: 'scopes', PRICING_RULES: 'pricingRules', PROPOSALS: 'proposals',
  PRICING_CATEGORIES: 'pricingCategories', USER_ACCESS: 'userAccess'
} as const;

export const CLIENT_STATUS = { 
  PENDING: 'pending_approval', 
  APPROVED: 'approved', 
  REJECTED: 'rejected' 
} as const;

export const PROJECT_STATUS = { 
  NOT_STARTED: 'not_started', 
  IN_PROGRESS: 'in_progress', 
  PENDING_DESIGN_APPROVAL: 'pending_design_approval', 
  DESIGN_APPROVED: 'design_approved', 
  COMPLETED: 'completed' 
} as const;

export const CLIENT_FIELDS = {
  COMPANY_NAME: 'companyName', CONTACT_PERSON: 'contactPerson', EMAIL: 'email', PHONE: 'phone',
  CITY: 'city', GSTIN: 'gstin', PRICING_CATEGORY: 'pricingCategory', SALES_PERSON_EMAIL: 'salesPersonEmail',
  PROPOSAL_NUMBER: 'proposalNumber', STATUS: 'status', CREATED_AT: 'createdAt'
} as const;

export const PROJECT_FIELDS = {
  PROJECT_NUMBER: 'projectNumber', CLIENT_ID: 'clientId', CLIENT_NAME: 'clientName',
  SCOPE_OF_WORK: 'scopeOfWork', SUB_SERVICE: 'subService', PLANT_CAPACITY: 'plantCapacity',
  CAPACITY_UNIT: 'capacityUnit', LOCATION: 'location', DESIGNER_EMAIL: 'designerEmail',
  PRICING_CATEGORY: 'pricingCategory', STATUS: 'status', CREATED_AT: 'createdAt', UPDATED_AT: 'updatedAt'
} as const;
