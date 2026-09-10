import { t } from '@/strings';
import type { ClientOperation, ClientErrorCode } from './client-mutation-input';
export function clientOperationTitle(operation: ClientOperation): string {
  return Object.entries(t.clients.manage.titles).find(([key]) => key === operation)![1];
}
export function clientErrorMessage(code: ClientErrorCode): string {
  return Object.entries(t.clients.manage.errors).find(([key]) => key === code)![1];
}
