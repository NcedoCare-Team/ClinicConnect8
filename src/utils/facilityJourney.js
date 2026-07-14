// Shared patient-facing facility journey steps — mirrors web staff workflow in real time.
// Patients never see triage colours or clinical scores.

/**
 * Derive patient-safe journey phase from a triageCases document.
 * Web: queued → Waiting | in_review / called → Attended | completed → Completed
 */
export function getFacilityJourneyPhase(caseData) {
  if (!caseData) return null;
  if (caseData.status === 'completed') return 'completed';
  if (
    caseData.status === 'in_review' ||
    caseData.patientCalledAt ||
    caseData.patientNotified ||
    caseData.nurseDecision ||
    caseData.reviewStartedAt
  ) {
    return 'attended';
  }
  return 'waiting';
}

export function facilityJourneyLabel(phase) {
  if (phase === 'completed') return 'Assessment completed';
  if (phase === 'attended') return 'Attended';
  if (phase === 'waiting') return 'Waiting';
  return '';
}

/**
 * @returns {Array<{ id: string, title: string, detail: string, done: boolean, active: boolean }>}
 */
export function buildFacilityJourneySteps(caseData, extras = {}) {
  if (!caseData) return [];
  const phase = getFacilityJourneyPhase(caseData);
  const countdown = extras.countdownLabel || '';
  const facility = caseData.facilityName || 'your healthcare facility';

  return [
    {
      id: 'waiting',
      title: 'Waiting',
      detail:
        phase === 'waiting'
          ? caseData.queuePosition
            ? `In the queue at ${facility}${countdown ? ` · ${countdown}` : ''}`
            : `Waiting at ${facility}`
          : `Joined the queue at ${facility}`,
      done: phase === 'attended' || phase === 'completed',
      active: phase === 'waiting',
    },
    {
      id: 'attended',
      title: 'Attended',
      detail:
        phase === 'attended'
          ? caseData.patientCalledAt || caseData.patientNotified
            ? 'Please come in — the care team is ready for you'
            : 'A healthcare worker is reviewing and attending to your case'
          : phase === 'completed'
            ? 'You were attended by the care team'
            : 'Staff will attend to you when ready',
      done: phase === 'completed',
      active: phase === 'attended',
    },
    {
      id: 'completed',
      title: 'Assessment completed',
      detail:
        phase === 'completed'
          ? 'Your visit is complete. You can start a new assessment if needed.'
          : 'Shown when your visit is finished',
      done: phase === 'completed',
      active: phase === 'completed',
    },
  ];
}

/** Short notice text pushed into the chat when the facility phase changes. */
export function facilityJourneyNotice(phase, facilityName) {
  const place = facilityName || 'your healthcare facility';
  if (phase === 'waiting') {
    return `Your request is in the waiting queue at ${place}. We will update you here as soon as the care team attends to you.`;
  }
  if (phase === 'attended') {
    return `You are being attended — a healthcare worker at ${place} is reviewing your case now. Please stay nearby.`;
  }
  if (phase === 'completed') {
    return `Your assessment visit at ${place} is completed. Chat is unlocked if you need further help.`;
  }
  return '';
}
