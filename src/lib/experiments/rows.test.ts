import { describe, expect, it } from 'vitest';
import { makePlan, snapshot } from './plan';
import { fromRow, toChange, toRow } from './rows';

describe('experiment rows', () => {
  it('round-trips an experiment', () => {
    const e = { ...makePlan({ kind: 'skipSetup', setup: 'Footprint' }), baseline: snapshot([]), startAt: '2026-10-05T00:00:00.000Z', status: 'running' as const, insightId: 'skipSetup:Footprint' };
    expect(fromRow({ id: 'x', ...toRow(e) } as never)).toEqual({ id: 'x', ...e, endAt: undefined, result: undefined, useful: undefined });
  });

  it('rejects changes it could misread', () => {
    expect(toChange({ kind: 'skipSetup', setup: '' })).toBeNull();
    expect(toChange({ kind: 'skipSession', session: 'Lunch' })).toBeNull();
    expect(toChange({ kind: 'doBetter' })).toBeNull();
    expect(toChange({ kind: 'checkFor', word: ' early entry ' })).toEqual({ kind: 'checkFor', word: 'early entry' });
  });
});
