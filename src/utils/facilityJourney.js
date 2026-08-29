// Shared patient-facing facility journey — mirrors web staff workflow in real time.
// Patients never see triage colours or clinical scores.

export const JOURNEY_STEP_IDS = [
  'facility',
  'assessment',
  'waiting_nurse',
  'see_nurse',
  'waiting_doctor',
  'see_doctor',
  'outcome',
];

export function isVisitSignedOut(caseData) {
  if (!caseData) return false;
  return (
    caseData.status === 'completed' ||
    caseData.disposition === 'sign_out'
  );
}

export function isVisitLive(caseData) {
  if (!caseData) return false;
  return !isVisitSignedOut(caseData);
}

export function isPatientStaying(caseData) {
  if (!caseData || isVisitSignedOut(caseData)) return false;
  return caseData.disposition === 'stay' || caseData.status === 'admitted';
}

/**
 * Derive the current patient-safe journey phase.
 * extras.hasFacility — true when a facility is linked even without a case.
 */
export function getFacilityJourneyPhase(caseData, extras = {}) {
  const hasFacility = extras.hasFacility ?? Boolean(
    caseData?.facilityId || caseData?.facilityName
  );

  if (!caseData) {
    return hasFacility ? 'assessment' : 'facility';
  }

  if (isVisitSignedOut(caseData)) return 'signed_out';
  if (isPatientStaying(caseData)) return 'stay';

  if (caseData.doctorCalledAt || caseData.doctorNotified || caseData.doctorReviewedAt) {
    return 'see_doctor';
  }
  if (caseData.nurseDecision) return 'waiting_doctor';
  if (
    caseData.status === 'in_review' ||
    caseData.patientCalledAt ||
    caseData.patientNotified ||
    caseData.reviewStartedAt
  ) {
    return 'see_nurse';
  }
  if (caseData.status === 'queued' || caseData.id) return 'waiting_nurse';

  return hasFacility ? 'assessment' : 'facility';
}

export function facilityJourneyLabel(phase) {
  switch (phase) {
    case 'facility':
      return 'Choose facility';
    case 'assessment':
      return 'Start assessment';
    case 'waiting_nurse':
    case 'waiting':
      return 'Waiting for nurse';
    case 'see_nurse':
    case 'attended':
      return 'See nurse';
    case 'waiting_doctor':
      return 'Waiting for doctor';
    case 'see_doctor':
      return 'See doctor';
    case 'stay':
      return 'Stay at facility';
    case 'signed_out':
    case 'completed':
      return 'Signed out';
    default:
      return '';
  }
}

function stepState(currentIndex, index) {
  return {
    done: index < currentIndex,
    active: index === currentIndex,
  };
}

function phaseToIndex(phase) {
  switch (phase) {
    case 'facility':
      return 0;
    case 'assessment':
      return 1;
    case 'waiting_nurse':
    case 'waiting':
      return 2;
    case 'see_nurse':
    case 'attended':
      return 3;
    case 'waiting_doctor':
      return 4;
    case 'see_doctor':
      return 5;
    case 'stay':
    case 'signed_out':
    case 'completed':
      return 6;
    default:
      return 0;
  }
}

/**
 * Full visit roadmap as a tree.
 * Last step (outcome) is Stay or Sign out based on the doctor's decision.
 *
 * @returns {Array<{ id: string, title: string, detail: string, done: boolean, active: boolean }>}
 */
export function buildFacilityJourneySteps(caseData, extras = {}) {
  const hasFacility = extras.hasFacility ?? Boolean(
    caseData?.facilityId || caseData?.facilityName
  );
  const facility = caseData?.facilityName || extras.facilityName || 'your healthcare facility';
  const countdown = extras.countdownLabel || '';
  const phase = getFacilityJourneyPhase(caseData, { hasFacility });
  const currentIndex = phaseToIndex(phase);
  const signedOut = phase === 'signed_out';
  const staying = phase === 'stay';

  const outcomeTitle = staying
    ? 'Stay at facility'
    : signedOut
      ? 'Signed out'
      : 'Doctor decision';

  const outcomeDetail = staying
    ? (caseData?.guidelines
      ? caseData.guidelines
      : `Please remain at ${facility} as advised by the doctor.`)
    : signedOut
      ? (caseData?.guidelines
        || caseData?.doctorConclusion
        || caseData?.diagnosis
        || `Your visit at ${facility} is complete. Follow any care instructions below.`)
      : 'After the doctor sees you, you will either stay for further care or be signed out.';

  const steps = [
    {
      id: 'facility',
      title: 'Choose facility',
      detail: hasFacility
        ? `Linked to ${facility}`
        : 'Connect a healthcare facility to start your visit',
      ...stepState(currentIndex, 0),
    },
    {
      id: 'assessment',
      title: 'Start assessment',
      detail: caseData
        ? (caseData.chiefComplaint
          ? `Assessment submitted · ${caseData.chiefComplaint}`
          : 'Your health assessment was sent to the care team')
        : hasFacility
          ? 'Describe your symptoms so the care team can prepare'
          : 'Available after you choose a facility',
      ...stepState(currentIndex, 1),
    },
    {
      id: 'waiting_nurse',
      title: 'Waiting for nurse call',
      detail:
        phase === 'waiting_nurse'
          ? caseData?.queuePosition
            ? `In the nurse queue at ${facility}${countdown ? ` · ${countdown}` : ''}`
            : `Waiting to be called at ${facility}`
          : currentIndex > 2
            ? 'The nurse called you in'
            : 'You will wait here until a nurse is ready',
      ...stepState(currentIndex, 2),
    },
    {
      id: 'see_nurse',
      title: 'See nurse',
      detail:
        phase === 'see_nurse'
          ? caseData?.patientCalledAt || caseData?.patientNotified
            ? 'Please come in — the nurse is ready for you'
            : 'A nurse is reviewing and attending to you now'
          : currentIndex > 3
            ? 'Nurse assessment completed'
            : 'The nurse will assess you and prepare you for the doctor',
      ...stepState(currentIndex, 3),
    },
    {
      id: 'waiting_doctor',
      title: 'Waiting for doctor call',
      detail:
        phase === 'waiting_doctor'
          ? 'Please stay nearby — the doctor will call you next'
          : currentIndex > 4
            ? 'The doctor called you in'
            : 'After the nurse, you wait to be called by the doctor',
      ...stepState(currentIndex, 4),
    },
    {
      id: 'see_doctor',
      title: 'See doctor',
      detail:
        phase === 'see_doctor'
          ? 'Please come in — the doctor is ready for you'
          : currentIndex > 5
            ? 'Doctor consultation completed'
            : 'The doctor will examine you and decide next steps',
      ...stepState(currentIndex, 5),
    },
    {
      id: staying ? 'stay' : signedOut ? 'signed_out' : 'outcome',
      title: outcomeTitle,
      detail: outcomeDetail,
      ...stepState(currentIndex, 6),
      done: signedOut || (staying && currentIndex > 6),
      active: staying || (currentIndex === 6 && !signedOut),
    },
  ];

  if (signedOut) {
    return steps.map((step) => ({ ...step, done: true, active: step.id === 'signed_out' }));
  }

  return steps;
}

/** Short notice text pushed into the chat when the facility phase changes. */
export function facilityJourneyNotice(phase, facilityName) {
  const place = facilityName || 'your healthcare facility';
  switch (phase) {
    case 'waiting':
    case 'waiting_nurse':
      return `Your request is in the waiting queue at ${place}. We will update you here when a nurse is ready to see you.`;
    case 'see_nurse':
    case 'attended':
      return `Please come in — a nurse at ${place} is ready to see you. Stay nearby.`;
    case 'waiting_doctor':
      return `The nurse has finished. Please wait nearby — the doctor at ${place} will call you next.`;
    case 'see_doctor':
      return `Please come in — the doctor at ${place} is ready to see you.`;
    case 'stay':
      return `The doctor has asked you to stay at ${place} for further care. Your visit remains open until you are signed out.`;
    case 'signed_out':
    case 'completed':
      return `You have been signed out at ${place}. Your visit summary and any follow-up instructions are now in My Care Journey.`;
    default:
      return '';
  }
}
