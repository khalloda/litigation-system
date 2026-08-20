import type { Metadata } from 'next';
import './globals.css';

/*
 * Root layout — task 0.1 skeleton.
 *
 * `lang="ar" dir="rtl"` is set here from the very first commit because it is
 * permanent (docs/BRAND.md), not because this page is finished. Fonts, brand
 * colours, the shared chrome and src/strings.ts all arrive in task 0.4.
 */

export const metadata: Metadata = {
  title: 'Litigation Management System',
  description: 'Sarie Eldin & Partners — litigation management system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
