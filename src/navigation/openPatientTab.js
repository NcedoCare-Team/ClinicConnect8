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

/** Switch tabs — use navigate (NativeTabs rejects replace from nested stacks). */
export function openPatientTab(tabId) {
  const path = resolveTabPath(tabId);
  if (path) router.navigate(path);
}

export function replacePatientTab(tabId) {
  openPatientTab(tabId);
}

export function openPatientHome(screen = 'HomeMain') {
  router.navigate(`/(app)/home/${screen}`);
}

export function openPatientAssessment(screen = 'AssessmentMain') {
  router.navigate(`/(app)/assessment/${screen}`);
}

export function openPatientJourney(screen = 'JourneyMain') {
  router.navigate(`/(app)/journey/${screen}`);
}

export function openPatientInsights(screen = 'InsightsMain') {
  router.navigate(`/(app)/insights/${screen}`);
}

export function openPatientProfile(screen = 'ProfileMain') {
  router.navigate(`/(app)/profile/${screen}`);
}

export function openChatConversation(params = {}) {
  router.push({
    pathname: '/(app)/assessment/ChatConversation',
    params: {
      conversationId: params.conversationId ?? '',
      conversationTitle: params.conversationTitle ?? 'Health Assessment',
      facilityName: params.facilityName ?? '',
    },
  });
}

export function openLiveChat(params = {}) {
  router.push({
    pathname: '/(app)/assessment/LiveChat',
    params: {
      conversationId: params.conversationId ?? '',
      facilityName: params.facilityName ?? '',
    },
  });
}

export function openFacilitySelection() {
  router.push('/(app)/home/FacilitySelection');
}

export function openFacilityWelcome(facility, userLocation) {
  router.push({
    pathname: '/(app)/home/FacilityWelcome',
    params: {
      facility: JSON.stringify(facility),
      userLocation: userLocation ? JSON.stringify(userLocation) : '',
    },
  });
}

export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(app)/home/HomeMain');
}

/** Parse route/search params that may be objects (stack) or JSON strings (router). */
export function parseNavParam(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}
