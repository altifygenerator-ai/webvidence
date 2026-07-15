'use client';

import { useState } from 'react';

export function BillingPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function openPortal() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Could not open billing management.');
      window.location.assign(data.url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : 'Could not open billing management.');
      setLoading(false);
    }
  }

  return <div className="billing-portal-action"><button className="btn" type="button" onClick={openPortal} disabled={loading}>{loading ? 'Opening Stripe…' : 'Manage billing and cancellation'}</button>{error ? <small className="plan-error">{error}</small> : null}</div>;
}
