'use client';

import UserManagementTab from '@/components/UserManagementTab';

export { UserManagementTab as Employees };
export default UserManagementTab;

export {
  parseAndNormalizeRole,
  normalizeEmpId,
  normalizeEmail,
  normalizeName,
  isCorporateEmail,
  isPersonalEmail,
  resolveDualEmails,
  deduplicateEmployeeList,
  ingestEmployeeSpreadsheet,
  executeDeduplicationSweep
} from '@/lib/employeeImportService';
