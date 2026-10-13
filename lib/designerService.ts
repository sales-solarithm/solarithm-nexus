import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isOwnerEmail } from '@/lib/firebase';
import { COLLECTIONS } from '@/src/config/schema';

export interface DesignerProfile {
  id: string;
  uid?: string;
  name: string;
  role: string;
  designation?: string;
  department?: string;
  email: string; // Official work email (@solarithmdesign.com)
  personalEmail?: string; // Personal address (@gmail.com)
  employeeId: string; // Canonical Employee ID (e.g. SDM-JS-001, SDM-DD-002)
  isPartner: boolean;
  formattedLabel: string; // e.g. "Jay Shah (Partner / Designer)" or "Kaushil Parmar (Designer)"
}

export interface ProjectDesignerBinding {
  assignedDesigner: string;
  designerEmail: string;
  designerId: string;
  designerName: string;
  isPartnerDesigner: boolean;
}

/**
 * Canonical partner and core designers list ensuring company partners and designers
 * ALWAYS appear in designer dropdowns across all tools.
 */
export const CANONICAL_DESIGNERS: DesignerProfile[] = [
  {
    id: 'sdm-js-001',
    uid: 'oIZpuLeftqaj3j5KS9ZIvurklEE2',
    name: 'Jay Shah',
    role: 'OWNER',
    designation: 'Company Partner & Lead Solar Designer',
    department: 'Executive Management',
    email: 'jayshah.03@solarithmdesign.com',
    personalEmail: 'jayjalpa2002@gmail.com',
    employeeId: 'SDM-JS-001',
    isPartner: true,
    formattedLabel: 'Jay Shah (Partner / Designer)'
  },
  {
    id: 'sdm-dd-002',
    name: 'Deep Davara',
    role: 'OWNER',
    designation: 'Company Partner & Senior Solar Designer',
    department: 'Executive Management',
    email: 'deepdavara@solarithmdesign.com',
    personalEmail: 'deepdavara@gmail.com',
    employeeId: 'SDM-DD-002',
    isPartner: true,
    formattedLabel: 'Deep Davara (Partner / Designer)'
  },
  {
    id: 'sdm-kp-005',
    name: 'Kaushil Parmar',
    role: 'DESIGNER',
    designation: 'Solar PV Design Engineer',
    department: 'Solar PV Design',
    email: 'kaushil.parmar@solarithmdesign.com',
    personalEmail: 'kaushil.parmar@gmail.com',
    employeeId: 'SDM-KP-005',
    isPartner: false,
    formattedLabel: 'Kaushil Parmar (Designer)'
  }
];

/**
 * Checks if a staff member qualifies for solar design engineering tasks.
 * Widen the designer query: includes staff where role or designation is:
 * 'DESIGNER', 'LEAD_DESIGNER', or 'OWNER' (case-insensitive).
 */
export function isDesignerEligible(user: {
  role?: string;
  designation?: string;
  email?: string;
  personalEmail?: string;
  name?: string;
}): boolean {
  if (!user) return false;
  const role = (user.role || '').trim().toLowerCase();
  const designation = (user.designation || '').trim().toLowerCase();
  const name = (user.name || '').trim().toLowerCase();
  const email = (user.email || '').trim().toLowerCase();
  const personalEmail = (user.personalEmail || '').trim().toLowerCase();

  const isOwner =
    role === 'owner' ||
    role.includes('owner') ||
    designation.includes('owner') ||
    designation.includes('partner') ||
    designation.includes('director') ||
    name.includes('jay shah') ||
    name.includes('deep davara') ||
    isOwnerEmail(email) ||
    isOwnerEmail(personalEmail);

  const isDesigner =
    role === 'designer' ||
    role === 'lead_designer' ||
    role.includes('designer') ||
    designation.includes('designer') ||
    designation.includes('cad') ||
    designation.includes('solar design');

  return isOwner || isDesigner;
}

/**
 * Formatted display labels:
 * - Dedicated designers: Full Name (Designer) (e.g. Kaushil Parmar (Designer))
 * - Company partners: Full Name (Partner / Designer) (e.g. Jay Shah (Partner / Designer))
 */
export function formatDesignerLabel(user: {
  name?: string;
  role?: string;
  designation?: string;
  email?: string;
  personalEmail?: string;
}): string {
  const name = (user.name || (user.email ? user.email.split('@')[0] : 'Unknown')).trim();
  const role = (user.role || '').trim().toLowerCase();
  const designation = (user.designation || '').trim().toLowerCase();
  const lowerName = name.toLowerCase();

  const isPartner =
    role === 'owner' ||
    role.includes('owner') ||
    designation.includes('partner') ||
    designation.includes('owner') ||
    lowerName.includes('jay shah') ||
    lowerName.includes('deep davara') ||
    isOwnerEmail(user.email) ||
    isOwnerEmail(user.personalEmail);

  if (isPartner) {
    return `${name} (Partner / Designer)`;
  }
  return `${name} (Designer)`;
}

/**
 * Fetches all eligible designers from Firestore (/users and /employees)
 * widening the query to include 'DESIGNER', 'LEAD_DESIGNER', and 'OWNER'.
 * Deduplicates and guarantees all partners appear with canonical work email & ID.
 */
export async function fetchEligibleDesigners(): Promise<DesignerProfile[]> {
  const designerMap = new Map<string, DesignerProfile>();

  // 1. Seed canonical partner and dedicated designers first
  CANONICAL_DESIGNERS.forEach((cd) => {
    designerMap.set(cd.employeeId.toUpperCase(), cd);
    designerMap.set(cd.email.toLowerCase(), cd);
  });

  try {
    // 2. Query Firestore 'employees' collection
    try {
      const empSnap = await getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees'));
      if (empSnap && !empSnap.empty) {
        empSnap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (isDesignerEligible(data)) {
            const empId = (data.employeeId || docSnap.id || '').toUpperCase();
            const email = (data.email || '').trim().toLowerCase();
            const name = (data.name || email.split('@')[0] || 'Designer').trim();
            const role = String(data.role || 'DESIGNER').toUpperCase();
            const isPartner =
              role === 'OWNER' ||
              role.includes('OWNER') ||
              (data.designation || '').toLowerCase().includes('partner') ||
              name.toLowerCase().includes('jay shah') ||
              name.toLowerCase().includes('deep davara') ||
              isOwnerEmail(email);

            // Canonical work email & ID resolution
            let officialEmail = email;
            let canonicalEmpId = empId;

            if (name.toLowerCase().includes('jay shah') || email.includes('jayshah')) {
              officialEmail = 'jayshah.03@solarithmdesign.com';
              canonicalEmpId = 'SDM-JS-001';
            } else if (name.toLowerCase().includes('deep davara') || email.includes('deepdavara')) {
              officialEmail = 'deepdavara@solarithmdesign.com';
              canonicalEmpId = 'SDM-DD-002';
            }

            const profile: DesignerProfile = {
              id: docSnap.id,
              uid: data.uid || docSnap.id,
              name,
              role,
              designation: data.designation || (isPartner ? 'Company Partner & Solar Designer' : 'Solar PV Designer'),
              department: data.department || (isPartner ? 'Executive Management' : 'Solar PV Design'),
              email: officialEmail || `${name.toLowerCase().replace(/\s+/g, '.')}@solarithmdesign.com`,
              personalEmail: data.personalEmail || data.personalEmailAddress || '',
              employeeId: canonicalEmpId,
              isPartner,
              formattedLabel: formatDesignerLabel({ name, role, designation: data.designation, email: officialEmail })
            };

            const key = canonicalEmpId || officialEmail || docSnap.id;
            designerMap.set(key, profile);
          }
        });
      }
    } catch (empErr) {
      console.warn('Notice querying employees collection for designers:', empErr);
    }

    // 3. Query Firestore 'users' collection for any complementary profiles
    try {
      const userSnap = await getDocs(collection(db, COLLECTIONS.USERS || 'users'));
      if (userSnap && !userSnap.empty) {
        userSnap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (isDesignerEligible(data)) {
            const empId = (data.employeeId || docSnap.id || '').toUpperCase();
            const email = (data.email || '').trim().toLowerCase();
            const name = (data.name || email.split('@')[0] || 'Designer').trim();
            const role = String(data.role || 'DESIGNER').toUpperCase();
            const isPartner =
              role === 'OWNER' ||
              role.includes('OWNER') ||
              (data.designation || '').toLowerCase().includes('partner') ||
              name.toLowerCase().includes('jay shah') ||
              name.toLowerCase().includes('deep davara') ||
              isOwnerEmail(email);

            let officialEmail = email;
            let canonicalEmpId = empId;

            if (name.toLowerCase().includes('jay shah') || email.includes('jayshah')) {
              officialEmail = 'jayshah.03@solarithmdesign.com';
              canonicalEmpId = 'SDM-JS-001';
            } else if (name.toLowerCase().includes('deep davara') || email.includes('deepdavara')) {
              officialEmail = 'deepdavara@solarithmdesign.com';
              canonicalEmpId = 'SDM-DD-002';
            }

            const key = canonicalEmpId || officialEmail || docSnap.id;
            if (!designerMap.has(key)) {
              designerMap.set(key, {
                id: docSnap.id,
                uid: data.uid || docSnap.id,
                name,
                role,
                designation: data.designation || (isPartner ? 'Company Partner & Solar Designer' : 'Solar PV Designer'),
                department: data.department || (isPartner ? 'Executive Management' : 'Solar PV Design'),
                email: officialEmail || `${name.toLowerCase().replace(/\s+/g, '.')}@solarithmdesign.com`,
                personalEmail: data.personalEmail || data.personalEmailAddress || '',
                employeeId: canonicalEmpId,
                isPartner,
                formattedLabel: formatDesignerLabel({ name, role, designation: data.designation, email: officialEmail })
              });
            }
          }
        });
      }
    } catch (userErr) {
      console.warn('Notice querying users collection for designers:', userErr);
    }
  } catch (err) {
    console.warn('Graceful fallback loading eligible designers:', err);
  }

  // Deduplicate unique profiles by Employee ID and official email
  const uniqueList: DesignerProfile[] = [];
  const seenEmpIds = new Set<string>();
  const seenEmails = new Set<string>();

  Array.from(designerMap.values()).forEach((dp) => {
    const empIdKey = dp.employeeId.toUpperCase();
    const emailKey = dp.email.toLowerCase();

    if (empIdKey && seenEmpIds.has(empIdKey)) return;
    if (emailKey && seenEmails.has(emailKey)) return;

    if (empIdKey) seenEmpIds.add(empIdKey);
    if (emailKey) seenEmails.add(emailKey);
    uniqueList.push(dp);
  });

  // Sort: Partners first (Jay Shah, Deep Davara), then dedicated designers alphabetically
  return uniqueList.sort((a, b) => {
    if (a.isPartner && !b.isPartner) return -1;
    if (!a.isPartner && b.isPartner) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * DIRECTIVE 1 #3: Bind Metadata on Project Assignment
 * When a partner/owner or dedicated designer is selected, binds official work email
 * (@solarithmdesign.com) and canonical Employee ID (e.g. SDM-JS-001, SDM-DD-002)
 * into assignedDesigner, designerEmail, and designerId.
 */
export function bindProjectDesignerMetadata(designer: Partial<DesignerProfile> & {
  name: string;
  email?: string;
  employeeId?: string;
  role?: string;
}): ProjectDesignerBinding {
  const name = designer.name.trim();
  const lowerName = name.toLowerCase();
  const inputEmail = (designer.email || '').toLowerCase().trim();

  let officialWorkEmail = designer.email || '';
  let canonicalId = designer.employeeId || '';
  let isPartner = false;

  if (
    lowerName.includes('jay shah') ||
    inputEmail.includes('jayshah') ||
    canonicalId.includes('JS-001')
  ) {
    officialWorkEmail = 'jayshah.03@solarithmdesign.com';
    canonicalId = 'SDM-JS-001';
    isPartner = true;
  } else if (
    lowerName.includes('deep davara') ||
    inputEmail.includes('deepdavara') ||
    canonicalId.includes('DD-002')
  ) {
    officialWorkEmail = 'deepdavara@solarithmdesign.com';
    canonicalId = 'SDM-DD-002';
    isPartner = true;
  } else if (
    lowerName.includes('kaushil parmar') ||
    inputEmail.includes('kaushil') ||
    canonicalId.includes('KP-005')
  ) {
    officialWorkEmail = 'kaushil.parmar@solarithmdesign.com';
    canonicalId = 'SDM-KP-005';
    isPartner = false;
  } else {
    // Standard staff designer
    if (!officialWorkEmail.includes('@solarithmdesign.com') && officialWorkEmail.includes('@')) {
      const username = officialWorkEmail.split('@')[0];
      officialWorkEmail = `${username}@solarithmdesign.com`;
    }
    const role = (designer.role || '').toLowerCase();
    isPartner = role === 'owner' || isOwnerEmail(officialWorkEmail);
  }

  return {
    assignedDesigner: name,
    designerEmail: officialWorkEmail,
    designerId: canonicalId,
    designerName: name,
    isPartnerDesigner: isPartner
  };
}

/**
 * Assigns a designer to a project document in Firestore.
 */
export async function assignDesignerToProject(
  projectId: string,
  designer: DesignerProfile
): Promise<ProjectDesignerBinding> {
  if (!projectId) throw new Error('Project ID is required.');
  const binding = bindProjectDesignerMetadata(designer);

  const projectRef = doc(db, COLLECTIONS.PROJECTS, projectId);
  await updateDoc(projectRef, {
    assignedDesigner: binding.assignedDesigner,
    designerEmail: binding.designerEmail,
    designerId: binding.designerId,
    designerName: binding.designerName,
    updatedAt: serverTimestamp()
  });

  return binding;
}
