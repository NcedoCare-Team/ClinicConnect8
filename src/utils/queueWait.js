// Queue wait helpers — patients ahead × short nurse slots (never multi-hour for small queues)

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const SLOT = { CRITICAL: 2, HIGH: 4, MEDIUM: 5, LOW: 5 };
const FRONT = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function sortQueueByUrgency(cases) {
  return [...cases].sort((a, b) => {
    const ra = PRIORITY_RANK[a.priority] ?? 4;
    const rb = PRIORITY_RANK[b.priority] ?? 4;
    if (ra !== rb) return ra - rb;
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return ta - tb;
  });
}

export function estimateWaitMinutes(priority, aheadCount) {
  const p = PRIORITY_RANK[priority] != null ? priority : 'MEDIUM';
  const ahead = Math.max(0, Math.floor(aheadCount || 0));
  const raw = FRONT[p] + ahead * SLOT[p];
  return Math.max(0, Math.min(raw, ahead * 8 + 5, 40));
}

export function formatWaitMinutes(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m <= 0) return 'Immediate';
  if (m < 60) return `~${m} min`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `~${hrs}h ${rem}m` : `~${hrs}h`;
}

export function formatCountdown(totalSeconds) {
  if (totalSeconds == null) return '—';
  if (totalSeconds <= 0) return 'Soon';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Compute live position + wait for one patient from the facility's active queue.
 */
export function computeLiveQueueStats(activeCases, caseId) {
  const sorted = sortQueueByUrgency(
    (activeCases || []).filter(
      (c) => c.status === 'queued' || c.status === 'in_review'
    )
  );
  const index = sorted.findIndex((c) => c.id === caseId);
  if (index < 0) {
    return { queuePosition: null, estimatedWaitMinutes: null, estimatedWait: '—', aheadCount: 0 };
  }
  const mine = sorted[index];
  const mins =
    mine.patientCalledAt || mine.patientNotified
      ? 0
      : estimateWaitMinutes(mine.priority || 'MEDIUM', index);
  return {
    queuePosition: index + 1,
    aheadCount: index,
    estimatedWaitMinutes: mins,
    estimatedWait: formatWaitMinutes(mins),
  };
}
