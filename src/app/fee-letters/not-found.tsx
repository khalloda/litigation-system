import { t } from '@/strings';
export default function NotFound() {
  return (
    <main>
      <p>{t.feeLettersModule.errors['not-found']}</p>
    </main>
  );
}
