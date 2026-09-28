import type { Metadata } from 'next';
import { t } from '@/strings';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/auth/permissions';
import { AppShell, type NavigationItem } from './_components/app-shell';
import './globals.css';

/*
 * Root layout.
 *
 * lang="ar" dir="rtl" is set here and nowhere else. Every screen in the
 * application inherits it — see docs/BRAND.md.
 */

export const metadata: Metadata = {
  title: {
    default: `${t.app.system} — ${t.app.name}`,
    template: `%s — ${t.app.system}`,
  },
  description: t.app.system,
  // Not a public site; nothing here should ever be indexed.
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const items: NavigationItem[] = [{ href: '/', label: t.nav.dashboard, primary: true }];
  if (session && !session.user.mustChangePassword) {
    const definitions = [
      ['/matters', t.nav.matters, 'matters', 'view', true],
      ['/hearings', t.nav.hearings, 'hearings', 'view', true],
      ['/clients', t.nav.clients, 'clients', 'view', true],
      ['/admin-works', t.nav.adminWorks, 'administrativeWorks', 'view', true],
      ['/reports', t.nav.reports, 'reports', 'run', true],
      ['/powers-of-attorney', t.poa.title, 'powersOfAttorney', 'view', false],
      ['/documents', t.nav.documents, 'documents', 'view', false],
      ['/fee-letters', t.nav.feeLetters, 'feeLetters', 'view', false],
      ['/billing', t.nav.billing, 'billing', 'view', false],
      ['/staff', t.nav.staff, 'staff', 'view', false],
      ['/users', t.nav.users, 'usersAndRoles', 'view', false],
      ['/audit-history', t.auditHistory.global, 'auditHistory', 'view', false],
    ] as const;
    for (const [href, label, area, action, primary] of definitions)
      if (hasPermission(session.user.role, area, action)) items.push({ href, label, primary });
  }
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/*
          The complete Arabic/Latin variable face is needed on every page, so fetch it alongside the
          stylesheet rather than after it. Without this the first paint shows
          a fallback face and the text visibly reflows.
        */}
        <link
          rel="preload"
          href="/fonts/NotoSansArabic-variable.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {session && !session.user.mustChangePassword ? (
          <AppShell
            items={items}
            name={session.user.name ?? ''}
            role={new Map(Object.entries(t.auth.roles)).get(session.user.role) ?? ''}
          >
            {children}
          </AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
