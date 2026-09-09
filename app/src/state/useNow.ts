import { useEffect, useState } from 'octane';

/**
 * The wall clock, coarse, and only while somebody is looking.
 *
 * `deriveState` is a pure function of `now` — which is the whole reason the 24-jam rule needs
 * no cron (§3). The other side of that coin was never wired up: `now` was pinned once per mount,
 * so on a gudang tablet left on for a week nothing ever advanced. A `pengambilan` never crossed
 * into `pemakaian`, a rack never became overdue for its cycle count, and "dicek 40 hari lalu"
 * stayed at 40 for as long as the page stayed open. Every one of those is a number that reads
 * as current and is not.
 *
 * FIVE MINUTES, not a second. Each tick re-folds the whole log, and nothing here is measured in
 * seconds: the 24-jam boundary and the count rotation are days apart, and a relative time
 * printed to the minute is already more precision than anyone reads. Nothing STOPS a screen
 * calling `Date.now()` for a value it stamps onto a record — this is what is DISPLAYED, and it
 * costs a fold.
 *
 * Frozen while the tab is hidden, and caught up the instant it is shown again: nobody is reading
 * a background tab, and re-folding the log for an empty screen every five minutes is work with
 * no reader.
 */
export function useNow(everyMs = 5 * 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };
    const start = () => { if (id === null) id = setInterval(() => setNow(Date.now()), everyMs); };

    const onVisibility = () => {
      if (document.hidden) { stop(); return; }
      /* Catch up FIRST, then resume. Coming back to a tab that has been closed for an hour and
         reading a clock an hour behind is exactly the failure this hook exists to remove. */
      setNow(Date.now());
      start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [everyMs]);

  return now;
}
