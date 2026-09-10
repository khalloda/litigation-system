'use client';
import { useState } from 'react';
import { t } from '@/strings';
import styles from './clients.module.css';
export function ClientLogo({
  id,
  name,
  version,
  archived = false,
}: {
  id: number;
  name: string;
  version: string;
  archived?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.logo}>
      {archived || failed ? (
        <p dir="auto">{name}</p>
      ) : (
        // Authenticated original-byte endpoint; Next's shared optimizer must not cache it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/clients/${id}/logo?version=${encodeURIComponent(version)}`}
          alt={t.clients.logo(name)}
          ref={(element) => {
            // A cached/fast failure can precede hydration and its error listener.
            if (element?.complete && element.naturalWidth === 0) setFailed(true);
          }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
