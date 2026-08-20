import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A type error must fail the production build, never ship silently.
  typescript: { ignoreBuildErrors: false },

  // Next 16 otherwise appends its own instructions to AGENTS.md every time
  // `next dev` runs. AGENTS.md is this project's reviewer brief for Codex —
  // a human-written document. A build tool must not edit it.
  agentRules: false,

  // Note: Next 16 no longer runs ESLint as part of `next build`.
  // Linting is a separate step — `npm run check` runs typecheck, lint and
  // the formatting check together. That is the command to run before
  // committing, and the one CI will run.
};

export default nextConfig;
