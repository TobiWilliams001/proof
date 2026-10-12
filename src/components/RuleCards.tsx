'use client';

import { ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { listItem } from './motion';
import { noticeText } from '@/lib/rules/notices';
import { useRules } from '@/lib/rules/useRules';
import { useJournal } from '@/lib/store';
import s from './RuleCards.module.css';

/**
 * Where the rules speak: on the journal, where the trader already is. A card
 * for a rule at its limit today, and a ready-written note for a rule broken.
 */
export function RuleCards() {
  const { data, dismissNotice, saveDraft, dismissDraft } = useJournal();
  const { rules, today } = useRules();
  const agent = data.agent;
  if (!agent) return null;

  const byId = new Map(rules.map((r) => [r.id, r]));
  const day = today[0]?.day;
  const notices = agent.notices.filter((n) => !n.dismissed && n.day === day && byId.get(n.ruleId)?.active);
  const drafts = agent.drafts.filter((d) => d.status === 'pending' && byId.has(d.ruleId));
  if (!notices.length && !drafts.length) return null;

  return (
    <section className={s.wrap} aria-label="Your rules today">
      <AnimatePresence initial={false}>
        {notices.map((n) => {
          const rule = byId.get(n.ruleId)!;
          const st = today.find((t) => t.ruleId === n.ruleId);
          const text = noticeText(rule, { state: n.state, used: st?.used ?? 0, limit: st?.limit ?? 0 });
          return (
            <motion.div key={`${n.ruleId}${n.day}`} className={s.card} {...listItem}>
              <ShieldCheck size={18} className={s.icon} aria-hidden />
              <div className={s.body}>
                <p className={s.title}>{text.title}</p>
                <p className={s.detail}>{text.detail}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => dismissNotice(n.ruleId, n.day)}>Got it</button>
            </motion.div>
          );
        })}
        {drafts.map((d) => (
          <Draft key={d.id} text={d.text} onSave={(t) => saveDraft(d.id, t)} onDismiss={() => dismissDraft(d.id)} />
        ))}
      </AnimatePresence>
    </section>
  );
}

function Draft({ text, onSave, onDismiss }: { text: string; onSave: (t: string) => void; onDismiss: () => void }) {
  const [value, setValue] = useState(text);
  return (
    <motion.div className={`${s.card} ${s.draft}`} {...listItem}>
      <div className={s.body}>
        <p className={s.title}>You went past one of your rules today.</p>
        <p className={s.detail}>Want to note it? It helps you see what led to it. Change the words if you like.</p>
        <textarea className={`input ${s.text}`} rows={2} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Rule-break note" />
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Not now</button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(value)}>Save to journal</button>
        </div>
      </div>
    </motion.div>
  );
}
