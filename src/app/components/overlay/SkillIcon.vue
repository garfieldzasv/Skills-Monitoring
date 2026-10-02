<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { settledAt, viewAt, type CooldownState } from "@/core/cooldown/cooldownTracker";
import type { ResolvedSkill } from "@/core/game/skillMeta";
import { useTicker } from "@/app/composables/useTicker";
import GameIcon from "@/app/components/common/GameIcon.vue";

const props = defineProps<{
  skill: ResolvedSkill;
  state: CooldownState | undefined;
  showDuration: boolean;
}>();

/*
 * Rendering cost model:
 * - idle icons read no clock at all;
 * - while something is pending, the icon holds the shared 250 ms ticker for its countdown text;
 * - the sweep is a CSS animation started once per recovery cycle (no per-frame JS);
 * - a single timeout at `settledAt` releases the ticker.
 */
const ticker = useTicker();
const pending = ref(false);
let release: (() => void) | undefined;
let settleTimer: number | undefined;

function stopPending() {
  pending.value = false;
  release?.();
  release = undefined;
  window.clearTimeout(settleTimer);
}

watch(
  () => props.state,
  (state) => {
    stopPending();
    if (!state) return;
    const remaining = settledAt(state) - Date.now();
    if (remaining <= 0) return;
    pending.value = true;
    release = ticker.hold();
    settleTimer = window.setTimeout(stopPending, remaining + 20);
  },
  { immediate: true },
);
onBeforeUnmount(stopPending);

const view = computed(() => {
  const state = props.state;
  if (!state || !pending.value) return undefined;
  return viewAt(state, ticker.now.value);
});

const charges = computed(() => view.value?.charges ?? props.skill.maxCharges);
const isCharge = computed(() => props.skill.maxCharges > 1);

/** Seconds below 100, whole minutes above, so text never exceeds two characters' width. */
function formatRemaining(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s < 100 ? String(s) : `${Math.ceil(s / 60)}m`;
}

const text = computed(() => {
  const v = view.value;
  if (!v) return { value: "", active: false };
  const now = ticker.now.value;
  if (props.showDuration && v.activeUntil !== null) {
    return { value: formatRemaining(v.activeUntil - now), active: true };
  }
  if (v.nextReadyAt !== null) {
    return { value: formatRemaining(v.nextReadyAt - now), active: false };
  }
  return { value: "", active: false };
});

/*
 * Sweep for the recovery cycle in progress, keyed by cycle start so the animation restarts.
 * `cycleStart` is a primitive computed: dependents re-run only when a new cycle begins, so the
 * negative delay is computed once per cycle (recomputing it every tick would shift the animation).
 */
const cycleStart = computed(() => view.value?.cycleStartAt ?? null);
const sweep = computed(() => {
  const start = cycleStart.value;
  if (start === null) return undefined;
  return {
    key: start,
    style: {
      animationDuration: `${props.skill.recastMs}ms`,
      animationDelay: `${start - Date.now()}ms`,
    },
  };
});

/** Flash only for a fresh cast, not when the icon re-mounts later (e.g. after a re-sort). */
const flashKey = computed(() => {
  const at = props.state?.lastUsedAt;
  return at && Date.now() - at < 400 ? at : null;
});
</script>

<template>
  <div
    class="skill"
    :class="{ empty: charges === 0, partial: isCharge && charges > 0 && sweep }"
    :title="skill.name"
  >
    <GameIcon :icon-id="skill.iconId" :alt="skill.name" class="icon" />
    <div v-if="sweep" :key="sweep.key" class="sweep" :style="sweep.style" />
    <div v-if="flashKey" :key="flashKey" class="flash" />
    <span v-if="text.value" class="countdown" :class="{ active: text.active }">{{ text.value }}</span>
    <span v-if="isCharge" class="charges" :class="{ zero: charges === 0 }">{{ charges }}</span>
  </div>
</template>

<style scoped>
.skill {
  position: relative;
  width: var(--icon-size);
  height: var(--icon-size);
  flex: none;
  border-radius: calc(var(--icon-size) * 0.12);
  overflow: hidden;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 70%), 0 1px 3px rgb(0 0 0 / 60%);
}

.icon {
  display: block;
  width: 100%;
  height: 100%;
}

.skill.empty .icon {
  filter: brightness(0.8) saturate(0.8);
}

@property --sweep {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}

/* Dark wedge shrinking clockwise as the charge recovers. */
.sweep {
  position: absolute;
  inset: 0;
  background: conic-gradient(transparent calc(var(--sweep) * 360deg), rgb(0 0 0 / 45%) 0);
  animation-name: sweep;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
  pointer-events: none;
}

.skill.partial .sweep {
  opacity: 0.55;
}

@keyframes sweep {
  from {
    --sweep: 0;
  }
  to {
    --sweep: 1;
  }
}

.flash {
  position: absolute;
  inset: 0;
  background: rgb(255 255 255 / 55%);
  opacity: 0;
  animation: flash 0.3s ease-out;
  pointer-events: none;
}

@keyframes flash {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.countdown {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: calc(var(--icon-size) * 0.44 * var(--text-scale));
  font-weight: 700;
  line-height: 1;
  color: #fff;
  text-shadow: 0 0 2px #000, 0 0 2px #000, 0 0 3px #000;
  font-variant-numeric: tabular-nums;
}

.countdown.active {
  color: #ffd34d;
}

/* Charges in the bottom-right corner, drawn like the in-game hotbar digits: bold white with a
   heavy dark outline (stroke painted under the fill), readable on bright icons too. */
.charges {
  position: absolute;
  right: calc(var(--icon-size) * 0.04);
  bottom: calc(var(--icon-size) * 0.01);
  font-size: calc(var(--icon-size) * 0.42 * var(--text-scale));
  font-weight: 800;
  line-height: 1;
  color: #fff;
  -webkit-text-stroke: calc(var(--icon-size) * 0.09 * var(--text-scale)) #000;
  paint-order: stroke fill;
  text-shadow: 0 0 calc(var(--icon-size) * 0.06) rgb(0 0 0 / 80%);
  font-variant-numeric: tabular-nums;
}

.charges.zero {
  color: #ff8a3d;
}
</style>
