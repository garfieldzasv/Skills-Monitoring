import { readonly, ref } from "vue";

/**
 * Shared clock for countdown text. It only runs while at least one consumer holds it, so an
 * idle overlay (nothing on cooldown) does no periodic work at all.
 */
const TICK_MS = 250;
const now = ref(Date.now());
let holders = 0;
let timer: number | undefined;

function start() {
  now.value = Date.now();
  timer = window.setInterval(() => (now.value = Date.now()), TICK_MS);
}

function stop() {
  window.clearInterval(timer);
  timer = undefined;
}

export function useTicker() {
  return {
    now: readonly(now),
    /** Keeps the clock running until the returned release function is called. */
    hold(): () => void {
      if (holders++ === 0) start();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--holders === 0) stop();
      };
    },
  };
}
