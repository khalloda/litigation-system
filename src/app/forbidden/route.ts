import { auth } from '@/auth';
import { t } from '@/strings';

export const runtime = 'nodejs';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function denialDocument(): string {
  const message = escapeHtml(t.errors.forbidden);
  const home = escapeHtml(t.nav.dashboard);
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${message}</title>
    <style>
      @font-face {
        font-family: "Noto Naskh Arabic";
        src: url("/fonts/noto-naskh-arabic-arabic-wght-normal.woff2") format("woff2");
        font-weight: 400 700;
        font-display: swap;
      }
      body {
        min-block-size: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        font-family: "Noto Naskh Arabic", sans-serif;
      }
      main {
        max-inline-size: 38rem;
        padding: 2rem;
        text-align: center;
      }
      a:focus-visible {
        outline: 0.2rem solid currentColor;
        outline-offset: 0.2rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${message}</h1>
      <p><a href="/">${home}</a></p>
    </main>
  </body>
</html>`;
}

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session) {
    return new Response(null, {
      status: 401,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  return new Response(denialDocument(), {
    status: 403,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
