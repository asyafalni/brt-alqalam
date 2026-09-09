// How long a thing has been out, and when that stops being normal.
//
// THE PROBLEM THIS EXISTS FOR. A unit borrowed three days ago and one borrowed since last
// Qurban looked identical: the Aset screen showed status and holder and nothing about time,
// even though `DerivedInstance.since` has carried it all along. So nothing ever escalated on
// its own — a loan quietly became a loss, and the only way to notice was for somebody to
// already suspect it and go looking. That is the mechanism behind the owner's boss's second
// complaint, "things go missing", stated as a UI fact.
//
// A GRADIENT, not a deadline. The system never refuses anything and never marks a thing lost by
// itself: only a person knows whether the drill is late or the borrower is on holiday. What it
// does is make the oldest loan the loudest, so it reaches the top of a list without anybody
// hunting for it. Chasing still happens over WhatsApp (§60); what was missing was only ever
// *who* and *since when*.

import type { DerivedInstance } from './types';

export const DAY = 24 * 60 * 60 * 1000;

/**
 * The rungs, in days. Owner's call: alert at a week, and get more serious from there.
 *
 * 30 matches the cycle-count rotation deliberately — a month is already this system's word for
 * "long enough that nobody can vouch for it any more".
 */
export const LOAN_STEPS = [7, 14, 30] as const;

export type LoanLevel = 'baru' | 'ditanya' | 'lama' | 'mungkin-hilang';

export interface LoanAge {
  days: number;
  level: LoanLevel;
}

export function loanAge(since: number | undefined, now: number): LoanAge {
  // No `since` means the log never recorded when it went out. Treated as new rather than as
  // ancient: inventing an age from missing data would put a phantom at the top of the list.
  if (since == null) return { days: 0, level: 'baru' };
  const days = Math.max(0, Math.floor((now - since) / DAY));
  if (days >= LOAN_STEPS[2]) return { days, level: 'mungkin-hilang' };
  if (days >= LOAN_STEPS[1]) return { days, level: 'lama' };
  if (days >= LOAN_STEPS[0]) return { days, level: 'ditanya' };
  return { days, level: 'baru' };
}

/** Everything out, oldest first — so the one worth chasing arrives at the top by itself. */
export function loansByAge(
  instances: readonly DerivedInstance[],
  now: number,
): { instance: DerivedInstance; age: LoanAge }[] {
  return instances
    .filter((d) => d.status === 'out')
    .map((d) => ({ instance: d, age: loanAge(d.since, now) }))
    .sort((a, b) => b.age.days - a.age.days);
}

/** How many loans have passed the first rung — the number a badge shows. */
export const overdueLoans = (instances: readonly DerivedInstance[], now: number): number =>
  loansByAge(instances, now).filter((l) => l.age.level !== 'baru').length;
