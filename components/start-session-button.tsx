'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

export function StartSessionButton({ sessionId, label = 'Start session' }: { sessionId?: string | null; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    setLoading(true); setError('');
    try {
      let id = sessionId;
      if (!id) {
        const response = await fetch('/api/sessions', { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not prepare the session.');
        id = data.session.id;
      }
      router.push(`/dashboard/session/${id}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Could not prepare the session.');
      setLoading(false);
    }
  }
  return <div className="start-session-control"><button className="btn primary" type="button" onClick={() => void start()} disabled={loading}>{loading ? 'Preparing session…' : label}<ArrowRight size={18} /></button>{error ? <span>{error}</span> : null}</div>;
}
