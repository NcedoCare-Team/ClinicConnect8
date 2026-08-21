import { router } from 'expo-router';

export const PATIENT_TAB_ROOTS = {
  home: 'HomeMain',
  assessment: 'AssessmentMain',
  journey: 'JourneyMain',
  insights: 'InsightsMain',
  profile: 'ProfileMain',
};

const TAB_PATHS = {
  home: '/(app)/home/HomeMain',
  assessment: '/(app)/assessment/AssessmentMain',
  journey: '/(app)/journey/JourneyMain',
  insights: '/(app)/insights/InsightsMain',
  profile: '/(app)/profile/ProfileMain',
  symptoms: '/(app)/assessment/AssessmentMain',
  records: '/(app)/journey/JourneyMain',
  queue: '/(app)/journey/JourneyMain',
};

function resolveTabPath(tabId) {
  if (tabId === 'symptoms') return TAB_PATHS.assessment;
  if (tabId === 'records' || tabId === 'queue') return TAB_PATHS.journey;
  return TAB_PATHS[tabId];
}

export function openPatientTab(tabId) {
  const path = resolveTabPath(tabId);
  if (path) router.push(path);
}

export function replacePatientTab(tabId) {
  const path = resolveTabPath(tabId);
  if (path) router.replace(path);
}

export function openPatientHome(screen = 'HomeMain') {
  router.push(`/(app)/home/${screen}`);
}

export function openPatientAssessment(screen = 'AssessmentMain') {
  router.push(`/(app)/assessment/${screen}`);
}

export function openPatientJourney(screen = 'JourneyMain') {
  router.push(`/(app)/journey/${screen}`);
}

export function openPatientInsights(screen = 'InsightsMain') {
  router.push(`/(app)/insights/${screen}`);
}

export function openPatientProfile(screen = 'ProfileMain') {
  router.push(`/(app)/profile/${screen}`);
}

export function openChatConversation(params = {}) {
  router.push({
    pathname: '/(app)/assessment/ChatConversation',
    params,
  });
}

export function openFacilitySelection() {
  router.push('/(app)/home/FacilitySelection');
}
