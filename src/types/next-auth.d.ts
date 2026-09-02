import type { DefaultSession } from 'next-auth';
import type { AuthRole } from '@/lib/auth/constants';

declare module 'next-auth' {
  interface User {
    personId: number;
    username: string;
    role: AuthRole;
    mustChangePassword: boolean;
    sessionVersion: number;
    rememberSession?: boolean;
    authenticatedAt?: number;
    auditSessionId: string;
  }

  interface Session {
    user: {
      id: string;
      personId: number;
      username: string;
      name: string;
      role: AuthRole;
      mustChangePassword: boolean;
      sessionVersion: number;
      auditSessionId: string;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userId?: number;
    personId?: number;
    username?: string;
    displayName?: string;
    role?: AuthRole;
    sessionVersion?: number;
    mustChangePassword?: boolean;
    authenticatedAt?: number;
    absoluteExpiresAt?: number;
    remembered?: boolean;
    auditSessionId?: string;
  }
}

export {};
