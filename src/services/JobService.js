// src/services/JobService.js
// Adzuna API — South Africa Job Listings + Market Trend Data
//
// ── How to get free API credentials ──────────────────────────────────────────
// 1. Go to https://developer.adzuna.com/
// 2. Click "Register" (free, no credit card required)
// 3. Verify your email → Dashboard → "Create App"
// 4. Copy your App ID + App Key into config.js
// Free tier: 250 requests/day (more than enough for a prototype)
// ─────────────────────────────────────────────────────────────────────────────

import CONFIG from '../../config';

const APP_ID  = CONFIG.ADZUNA_APP_ID  ?? 'YOUR_ADZUNA_APP_ID';
const APP_KEY = CONFIG.ADZUNA_APP_KEY ?? 'YOUR_ADZUNA_APP_KEY';
const BASE    = 'https://api.adzuna.com/v1/api/jobs/za';
const RESULTS_PER_PAGE = 10;

// ─── Adzuna Category Tags (ZA) ───────────────────────────────────────────────
// These are Adzuna's category tags for South Africa
export const JOB_CATEGORIES = [
  { label: 'Tech & IT',          tag: 'it-jobs',                    icon: 'code-slash',          color: '#2563EB' },
  { label: 'Finance',            tag: 'accounting-finance-jobs',    icon: 'cash',                color: '#10B981' },
  { label: 'Healthcare',         tag: 'healthcare-nursing-jobs',    icon: 'medkit',              color: '#EF4444' },
  { label: 'Engineering',        tag: 'engineering-jobs',           icon: 'construct',           color: '#F59E0B' },
  { label: 'Marketing',          tag: 'marketing-jobs',             icon: 'megaphone',           color: '#8B5CF6' },
  { label: 'Retail',             tag: 'retail-jobs',                icon: 'bag-handle',          color: '#06B6D4' },
  { label: 'Education',          tag: 'teaching-jobs',              icon: 'school',              color: '#F97316' },
  { label: 'Admin & Office',     tag: 'admin-jobs',                 icon: 'briefcase',           color: '#64748B' },
  { label: 'Sales',              tag: 'sales-jobs',                 icon: 'trending-up',         color: '#EC4899' },
  { label: 'HR & Recruitment',   tag: 'hr-jobs',                    icon: 'people',              color: '#14B8A6' },
];

// ─── Helper: Build auth params ────────────────────────────────────────────────
const authParams = () => `app_id=${APP_ID}&app_key=${APP_KEY}`;

// ─── Helper: Clean job description (strip HTML) ──────────────────────────────
function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

// ─── Helper: Format salary ────────────────────────────────────────────────────
function formatSalary(min, max) {
  if (!min && !max) return null;
  const fmt = (n) => `R${Math.round(n / 1000)}k`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
}

// ─── Helper: Time since posted ────────────────────────────────────────────────
// Helper: Parse Adzuna date safely (always UTC)
function parseAdzunaDate(dateStr) {
  if (!dateStr) return null;
  // If it already has Z or a timezone offset, parse directly
  if (dateStr.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }
  // Otherwise, assume it's UTC and append 'Z'
  return new Date(dateStr + 'Z');
}

function timeAgo(dateStr) {
  const date = parseAdzunaDate(dateStr);
  if (!date || isNaN(date.getTime())) {
    console.warn(`[timeAgo] Invalid date: ${dateStr}`);
    return 'Recently';
  }

  const diff = Date.now() - date.getTime();

  // If the date is in the future, treat as "just now"
  if (diff < 0) return 'Just now';

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  const days    = Math.floor(diff / 86400000);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24)   return `${hours}h ago`;
  if (days === 1)   return '1 day ago';
  if (days < 7)     return `${days} days ago`;
  if (days < 30)    return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Helper: Normalise Adzuna result ─────────────────────────────────────────
function normaliseJob(raw) {
  return {
    id:          raw.id,
    title:       raw.title,
    company:     raw.company?.display_name ?? 'Company',
    location:    raw.location?.display_name ?? 'South Africa',
    description: stripHtml(raw.description),
    salary:      formatSalary(raw.salary_min, raw.salary_max),
    salaryMin:   raw.salary_min ?? null,
    salaryMax:   raw.salary_max ?? null,
    postedAt:    timeAgo(raw.created),
    createdRaw:  raw.created,
    applyUrl:    raw.redirect_url,
    category:    raw.category?.label ?? 'General',
    categoryTag: raw.category?.tag   ?? '',
    type:        raw.contract_time   ?? 'Full time',
  };
}

// ─── Helper: Fetch with retry logic (handles 429 rate limiting) ──────────────
async function fetchWithRetry(url, maxRetries = 3, initialDelayMs = 500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      
      // If rate limited, wait and retry
      if (res.status === 429) {
        if (attempt < maxRetries) {
          const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
          console.log(`[JobService] Rate limited (429). Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        } else {
          throw new Error('Rate limited (429) - API quota exceeded. Please try again later.');
        }
      }
      
      if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
      
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// ─── 1. Fetch personalised jobs (For You) ─────────────────────────────────────
/**
 * @param {string[]} skills - User's top skills (from About Me)
 * @param {number}   page   - Pagination page (1-based)
 */
export async function fetchJobsForUser(skills = [], page = 1) {
  try {
    const keywords = skills.filter(Boolean).join(' OR ') || 'jobs';
    const url = `${BASE}/search/${page}?${authParams()}&results_per_page=${RESULTS_PER_PAGE}&what=${encodeURIComponent(keywords)}&where=south+africa&sort_by=date&content-type=application/json`;

    const res  = await fetchWithRetry(url);
    const data = await res.json();

    return {
      jobs:  (data.results ?? []).map(normaliseJob),
      total: data.count ?? 0,
      page,
    };
  } catch (err) {
    console.log('[JobService] fetchJobsForUser error:', err);
    return { jobs: [], total: 0, page };
  }
}

// ─── 2. Fetch jobs by category ────────────────────────────────────────────────
/**
 * @param {string} categoryTag - e.g. 'it-jobs'
 * @param {number} page
 */
export async function fetchJobsByCategory(categoryTag, page = 1) {
  try {
    const url = `${BASE}/search/${page}?${authParams()}&results_per_page=${RESULTS_PER_PAGE}&category=${categoryTag}&sort_by=date&content-type=application/json`;

    const res  = await fetchWithRetry(url);
    const data = await res.json();

    return {
      jobs:  (data.results ?? []).map(normaliseJob),
      total: data.count ?? 0,
      page,
    };
  } catch (err) {
    console.log('[JobService] fetchJobsByCategory error:', err);
    return { jobs: [], total: 0, page };
  }
}

// ─── 3. Fetch market trends (top categories by job count) ─────────────────────
/**
 * Fetches job counts for the top 5 categories sequentially with delays to avoid rate limiting.
 * Returns an array of { label, tag, icon, color, count, trend } objects.
 */
export async function fetchMarketTrends() {
  const topCategories = JOB_CATEGORIES.slice(0, 6);

  try {
    const results = [];
    
    // Fetch sequentially with delays instead of concurrent to avoid 429 rate limits
    for (let i = 0; i < topCategories.length; i++) {
      try {
        const cat = topCategories[i];
        const url = `${BASE}/search/1?${authParams()}&results_per_page=1&category=${cat.tag}&content-type=application/json`;
        
        const res = await fetchWithRetry(url);
        const data = await res.json();
        
        results.push({ ...cat, count: data.count ?? 0 });
        
        // Add delay between requests to be respectful to the API
        if (i < topCategories.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (err) {
        console.warn(`[JobService] Failed to fetch trends for category:`, err);
        // Continue with other categories instead of failing completely
        results.push({ ...topCategories[i], count: 0 });
      }
    }

    const trends = results.sort((a, b) => b.count - a.count);

    // Compute a simple trend indicator relative to the median
    const counts = trends.map(t => t.count).filter(c => c > 0);
    const median = counts.length > 0 ? counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)] : 0;

    return trends.map(t => ({
      ...t,
      trend:       t.count > median ? 'up' : 'stable',
      trendPct:    median > 0 ? Math.round(((t.count - median) / median) * 100) : 0,
    }));
  } catch (err) {
    console.log('[JobService] fetchMarketTrends error:', err);
    return topCategories.map(c => ({ ...c, count: 0, trend: 'stable', trendPct: 0 }));
  }
}

// ─── 4. Full-text search jobs ─────────────────────────────────────────────────
/**
 * @param {string} query     - Free-text search
 * @param {string} category  - Optional category tag
 * @param {number} page
 */
export async function searchJobs(query = '', category = '', page = 1) {
  try {
    let url = `${BASE}/search/${page}?${authParams()}&results_per_page=${RESULTS_PER_PAGE}&sort_by=date&content-type=application/json`;
    if (query)    url += `&what=${encodeURIComponent(query)}`;
    if (category) url += `&category=${category}`;

    const res  = await fetchWithRetry(url);
    const data = await res.json();

    return {
      jobs:  (data.results ?? []).map(normaliseJob),
      total: data.count ?? 0,
      page,
    };
  } catch (err) {
    console.log('[JobService] searchJobs error:', err);
    return { jobs: [], total: 0, page };
  }
}