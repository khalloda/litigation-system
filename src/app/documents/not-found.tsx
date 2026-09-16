import { t } from '@/strings';
export default function NotFound() {
  return (
    <main>
      <p>{t.documentsModule.errors['not-found']}</p>
    </main>
  );
}
