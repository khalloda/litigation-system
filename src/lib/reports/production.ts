import 'server-only';
import { db } from '@/lib/db';
import { reportDefinitions } from './registry';
import { createReportEngine } from './engine';
export const reporting = createReportEngine(reportDefinitions, db);
