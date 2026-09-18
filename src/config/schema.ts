export const COLLECTIONS = { 
  USERS: 'users', 
  EMPLOYEES: 'employees', 
  CLIENTS: 'clients', 
  PROJECTS: 'projects', 
  APPS: 'apps', 
  SCOPES: 'scopes', 
  PRICING_RULES: 'pricingRules', 
  COMMISSION_RULES: 'commissionRules', 
  PROPOSALS: 'proposals', 
  CHANGE_REQUESTS: 'changeRequests', 
  PRICING_CATEGORIES: 'pricingCategories',
  PASSWORD_RESET_REQUESTS: 'passwordResetRequests',
  APPROVALS: 'approvals',
  DEPARTMENTS: 'departments'
} as const;
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
export const CLIENT_FIELDS = { COMPANY_NAME: 'companyName', CONTACT_PERSON: 'contactPerson', EMAIL: 'email', PHONE: 'phone', CITY: 'city', GSTIN: 'gstin', PRICING_CATEGORY: 'pricingCategory', SALES_PERSON_EMAIL: 'salesPersonEmail', PROPOSAL_NUMBER: 'proposalNumber', STATUS: 'status', CREATED_AT: 'createdAt' } as const;
export const PROJECT_FIELDS = { PROJECT_NUMBER: 'projectNumber', PROJECT_NAME: 'projectName', CLIENT_ID: 'clientId', CLIENT_NAME: 'clientName', SCOPE_OF_WORK: 'scopeOfWork', SUB_SERVICE: 'subService', PLANT_CAPACITY: 'plantCapacity', CAPACITY_UNIT: 'capacityUnit', LOCATION: 'location', DESIGNER_EMAIL: 'designerEmail', PRICING_CATEGORY: 'pricingCategory', STATUS: 'status', CREATED_AT: 'createdAt', UPDATED_AT: 'updatedAt' } as const;
