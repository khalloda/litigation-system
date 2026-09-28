import { cache } from 'react';
import { getTodayHearings } from '@/lib/today-hearings';
import { getOpenDecisions, getLawyerWorkload } from '@/lib/dashboard';

// Request-scoped React cache shares the exact guarded snapshot between the
// summary cards and record panels. No cross-user or persistent data cache.
export const todaySnapshot = cache(getTodayHearings);
export const openSnapshot = cache(getOpenDecisions);
export const workloadSnapshot = cache(getLawyerWorkload);
