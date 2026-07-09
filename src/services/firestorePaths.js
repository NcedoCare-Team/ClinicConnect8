// Firestore paths aligned with cloud rules (firestore.rules.json).

import { doc } from 'firebase/firestore';

export const COLLECTIONS = {
  PATIENTS:     'patients',
  TRIAGE_CASES: 'triageCases',
  FACILITIES:   'facilities',
  STAFF:        'staff',
};

export const patientRef = (firestore, uid) =>
  doc(firestore, COLLECTIONS.PATIENTS, uid);

export { doc };
