<script setup lang="ts">
import { computed, watchEffect } from "vue";
import CalibrationGrid from "@/app/components/overlay/CalibrationGrid.vue";
import MemberRow from "@/app/components/overlay/MemberRow.vue";
import { usePreviewFlags } from "@/app/composables/useOverlayBridge";
import { useOverlayLock } from "@/app/composables/useOverlayLock";
import { useLayout } from "@/app/composables/useSettings";
import { useMonitor } from "@/app/composables/useMonitor";
import { openSettingsWindow, urlParams } from "@/app/composables/useUrlParams";

const monitor = useMonitor();
const layout = useLayout();
const preview = usePreviewFlags();
const { unlocked } = useOverlayLock();

// Demo party while unlocked, either on request or automatically when there is no real party.
watchEffect(() => {
  const forced = preview.state.value.forceDemo || urlParams.demo;
  monitor.demo.value = unlocked.value && (forced || monitor.realPartySize.value <= 1);
});

const cssVars = computed(() => {
  const l = layout.state.value;
  return {
    "--icon-size": `${l.iconSize}px`,
    "--row-pitch": `${l.rowPitch}px`,
    "--icon-gap": `${l.iconGap}px`,
    "--offset-x": `${l.offsetX}px`,
    "--offset-y": `${l.offsetY}px`,
    "--text-scale": String(l.textScale),
    "--row-direction": l.direction === "rtl" ? "row-reverse" : "row",
    "--rows-align": l.direction === "rtl" ? "flex-end" : "flex-start",
    // Calibration row numbers sit on the side away from the icons.
    "--band-label-align": l.direction === "rtl" ? "flex-start" : "flex-end",
    "--hint-left": l.direction === "rtl" ? "6px" : "auto",
    "--hint-right": l.direction === "rtl" ? "auto" : "6px",
    opacity: String(l.opacity),
  };
});

const stateOf = (key: string) => monitor.cooldowns.get(key);

/** Right-click anywhere opens the settings window (the overlay itself shows icons only). */
function openSettings(e: MouseEvent) {
  e.preventDefault();
  openSettingsWindow();
}
</script>

<template>
  <div class="overlay" :style="cssVars" @contextmenu="openSettings">
    <!-- Unlocked: outline the window so its edges are visible while resizing, plus a hint. -->
    <div v-if="unlocked" class="frame" aria-hidden="true">
      <span class="hint">右键打开设置</span>
    </div>
    <CalibrationGrid v-if="unlocked && preview.state.value.calibrate" />
    <div class="rows">
      <MemberRow
        v-for="row in monitor.rows.value"
        :key="row.member.id"
        :row="row"
        :state-of="stateOf"
        :show-duration="layout.state.value.showDuration"
      />
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  user-select: none;
}

/* Positioned so the icons paint above the frame and calibration layers. */
.rows {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: var(--rows-align);
  padding: var(--offset-y) var(--offset-x);
}

.frame {
  position: fixed;
  inset: 0;
  border: 2px dashed rgb(255 214 77 / 85%);
  background: rgb(0 0 0 / 12%);
  pointer-events: none;
}

/* Bottom corner on the side away from the icons; hidden when locked like the frame. */
.hint {
  position: absolute;
  bottom: 6px;
  left: var(--hint-left);
  right: var(--hint-right);
  max-width: calc(100% - 12px);
  padding: 2px 8px;
  border-radius: 10px;
  background: rgb(0 0 0 / 65%);
  color: #ffd64d;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
