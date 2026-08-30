'use client';

import { useEffect } from 'react';

export function LeadReviewTracker({ leadId }: { leadId: string }) {
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewed: true }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [leadId]);

  return null;
}
