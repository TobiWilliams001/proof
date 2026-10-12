'use client';

import { useEffect } from 'react';
import { useJournal } from '../store';
import { emptyAgent, stepAgent } from './notices';
import { useRules } from './useRules';

/**
 * Runs whenever trades or rules change (a sync, a manual trade, a new rule):
 * records what Proof should say, and sends the first message of the day to the
 * device if the trader allowed notifications.
 */
export function useRuleWatcher() {
  const { data, ready, setAgent } = useJournal();
  const { rules, today, ready: rulesReady } = useRules();

  useEffect(() => {
    if (!ready || !rulesReady) return;
    const step = stepAgent(data.agent ?? emptyAgent(), today, rules, data.trades, new Date());
    if (!step.changed) return;
    setAgent(step.next);
    for (const n of step.notify) notifyDevice(n.title, `rule-${n.ruleId}`);
  }, [ready, rulesReady, today, rules, data.trades, data.agent, setAgent]);
}

async function notifyDevice(title: string, tag: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    // Only when Proof isn't on screen: on screen, the card says it.
    if (document.visibilityState === 'visible') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification('Proof', { body: title, tag, icon: '/icon-192.png' });
    else new Notification('Proof', { body: title, tag });
  } catch {
    // A missed notification is fine; the card is waiting in the app.
  }
}
