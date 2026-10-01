<script setup lang="ts">
import type { CooldownState } from "@/core/cooldown/cooldownTracker";
import type { MemberRow } from "@/core/engine/monitorEngine";
import SkillIcon from "./SkillIcon.vue";

defineProps<{
  row: MemberRow;
  /** Reads a cooldown by key; reading inside render scopes reactivity to this row's keys. */
  stateOf: (key: string) => CooldownState | undefined;
  showDuration: boolean;
}>();
</script>

<template>
  <div class="row">
    <template v-for="(slot, i) in row.slots" :key="slot.key ?? `empty-${i}`">
      <SkillIcon v-if="slot.skill" :skill="slot.skill" :state="stateOf(slot.key!)" :show-duration="showDuration" />
      <div v-else class="spacer" />
    </template>
  </div>
</template>

<style scoped>
.row {
  height: var(--row-pitch);
  display: flex;
  flex-direction: var(--row-direction);
  align-items: center;
  gap: var(--icon-gap);
}

.spacer {
  width: var(--icon-size);
  height: var(--icon-size);
  flex: none;
}
</style>
