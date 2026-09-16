'use client';
import { t } from '@/strings';
export default function Error() {
  return (
    <main>
      <p role="alert">{t.errors.generic}</p>
    </main>
  );
}
