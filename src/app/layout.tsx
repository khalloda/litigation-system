import type { Metadata } from 'next';
import { t } from '@/strings';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/*
          The Arabic subset is needed on every page, so fetch it alongside the
          stylesheet rather than after it. Without this the first paint shows
          a fallback face and the text visibly reflows.
        */}
        <link
          rel="preload"
          href="/fonts/noto-naskh-arabic-arabic-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
