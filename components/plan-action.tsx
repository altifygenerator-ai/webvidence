'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PLANS,
  isPaidPlan,
  nextPaidPlan,
  planRank,
  type CustomerPlanId,
  type PaidPlanId,
  type PlanId,
} from '@/lib/plans';
import { authPath } from '@/lib/security/redirects';

type Props = {
  plan: CustomerPlanId;
  signedIn: boolean;
  currentPlan?: PlanId | null;
  autoStart?: boolean;
};

async function requestCheckout(targetPlan: PaidPlanId) {
  const response = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: targetPlan }),
  });
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (response.status === 401) {
    window.location.assign(authPath('login', targetPlan));
    return null;
  }
  if (!response.ok || !data.url) throw new Error(data.error || 'Unable to start checkout.');
  return data.url;
}

export function PlanAction({ plan, signedIn, currentPlan = 'free', autoStart = false }: Props) {
  const activePlan: PlanId = currentPlan || 'free';
  const isAdmin = activePlan === 'admin';
  const currentRank = planRank(activePlan);
  const targetRank = planRank(plan);
  const isCurrent = !isAdmin && activePlan === plan;
  const isLower = !isAdmin && targetRank < currentRank;
  const canPurchase = signedIn && !isAdmin && isPaidPlan(plan) && targetRank > currentRank;
  const suggestedUpgrade = nextPaidPlan(activePlan);
  const [loading, setLoading] = useState(autoStart && canPurchase);
  const [error, setError] = useState('');
  const [showCurrentMessage, setShowCurrentMessage] = useState(autoStart && isCurrent);
  const started = useRef(false);

  const startCheckout = useCallback(async (targetPlan: PaidPlanId) => {
    setLoading(true);
    setError('');
    try {
      const url = await requestCheckout(targetPlan);
      if (url) window.location.assign(url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoStart || started.current || !canPurchase || !isPaidPlan(plan)) return;
    started.current = true;
    let active = true;
    void requestCheckout(plan)
      .then((url) => { if (url && active) window.location.assign(url); })
      .catch((checkoutError: unknown) => {
        if (!active) return;
        setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [autoStart, canPurchase, plan]);

  if (!signedIn) {
    if (plan === 'free') return <Link className="btn primary" href="/signup">Start free</Link>;
    return <Link className="btn primary" href={authPath('signup', plan)}>Choose {PLANS[plan].name}</Link>;
  }

  if (isAdmin) {
    return <div className="plan-action"><Link className="btn" href="/dashboard">Admin access includes this plan</Link></div>;
  }

  if (plan === 'free') {
    return <div className="plan-action"><Link className="btn" href="/dashboard">{activePlan === 'free' ? 'Your current plan' : `Included with ${PLANS[activePlan].name}`}</Link></div>;
  }

  if (isLower) {
    return <div className="plan-action"><button className="btn" type="button" disabled>Included with {PLANS[activePlan].name}</button></div>;
  }

  if (isCurrent) {
    const maximum = activePlan === 'studio';
    return (
      <div className="plan-action">
        <button className="btn" type="button" onClick={() => setShowCurrentMessage((value) => !value)}>Your current plan</button>
        {showCurrentMessage ? (
          <div className="plan-current-message" role="status">
            <strong>{maximum ? 'You already have the maximum plan.' : `You already have ${PLANS[activePlan].name}.`}</strong>
            {!maximum && suggestedUpgrade ? (
              <>
                <span>Would you like to upgrade to {PLANS[suggestedUpgrade].name}?</span>
                <button className="btn primary" type="button" onClick={() => void startCheckout(suggestedUpgrade)} disabled={loading}>
                  {loading ? 'Opening upgrade…' : `Upgrade to ${PLANS[suggestedUpgrade].name}`}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {error ? <small className="plan-error">{error}</small> : null}
      </div>
    );
  }

  return (
    <div className="plan-action">
      <button className="btn primary" type="button" onClick={() => void startCheckout(plan)} disabled={loading}>
        {loading
          ? activePlan === 'free' ? 'Opening checkout…' : 'Opening upgrade…'
          : activePlan === 'free' ? `Choose ${PLANS[plan].name}` : `Upgrade to ${PLANS[plan].name}`}
      </button>
      {autoStart && loading ? <small className="plan-status">Taking you to secure Stripe checkout…</small> : null}
      {error ? <small className="plan-error">{error}</small> : null}
    </div>
  );
}
