'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function ReminderReturnTracker() {
  const params = useSearchParams();
  const marker = params.get('from');
  useEffect(() => {
    if (marker !== 'reminder') return;
    const key = `webvidence:returned-from-reminder:${window.location.pathname}:${window.location.search}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
    void fetch('/api/product-events', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'returned_from_reminder', surface: window.location.pathname.slice(0, 60) }),
    }).catch(() => undefined);
  }, [marker]);
  return null;
}
