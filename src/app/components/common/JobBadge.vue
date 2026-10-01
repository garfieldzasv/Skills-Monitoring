<script setup lang="ts">
import { computed } from "vue";
import { getJob, jobIconId } from "@/core/game/jobs";
import GameIcon from "./GameIcon.vue";

// Boolean props default to false in Vue, so the opt-out flag is the negative one.
const props = defineProps<{ jobId: number; hideName?: boolean }>();
const job = computed(() => getJob(props.jobId));
</script>

<template>
  <span class="job-badge" :class="job?.role">
    <GameIcon :icon-id="jobIconId(jobId)" :alt="job?.abbr" class="job-icon" />
    <span v-if="!hideName">{{ job?.name ?? `#${jobId}` }}</span>
  </span>
</template>

<style scoped>
.job-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.job-icon {
  width: 20px;
  height: 20px;
}

.tank {
  color: var(--role-tank);
}
.healer {
  color: var(--role-healer);
}
.melee,
.ranged,
.caster {
  color: var(--role-dps);
}
</style>
