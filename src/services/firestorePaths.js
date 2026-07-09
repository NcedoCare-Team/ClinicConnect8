// Firestore paths aligned with shared cloud rules (firestore.rules).

import { doc } from 'firebase/firestore';

export const COLLECTIONS = {
  PATIENTS: 'patients',
  TRIAGE_CASES: 'triageCases',
  FACILITIES: 'facilities',
  STAFF: 'staff',
};

export const patientRef = (firestore, uid) =>
  doc(firestore, COLLECTIONS.PATIENTS, uid);

export const facilityRef = (firestore, facilityId) =>
  doc(firestore, COLLECTIONS.FACILITIES, facilityId);

export { doc };
