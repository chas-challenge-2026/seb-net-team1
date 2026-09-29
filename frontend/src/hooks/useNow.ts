import { useSyncExternalStore } from 'react';

/*
 * A shared clock for relative times ("för 5 min sedan") and greetings. Reading
 * Date.now() during render would make renders impure, so the time lives in a small
 * external store that ticks while at least one component is subscribed.
 */

const TICK_MS = 30_000;

let now = Date.now();
let timer: number | undefined;
const subscribers = new Set<() => void>();

function subscribe(onChange: () => void) {
  subscribers.add(onChange);
  if (timer === undefined) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      for (const subscriber of subscribers) subscriber();
    }, TICK_MS);
  }
  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  return now;
}

/** The current time in milliseconds, refreshed every 30 seconds. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
