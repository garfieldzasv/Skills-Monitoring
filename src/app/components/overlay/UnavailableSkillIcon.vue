<script setup lang="ts">
import type { UnavailableSkill } from "@/core/engine/monitorEngine";
import GameIcon from "@/app/components/common/GameIcon.vue";

defineProps<{ skill: UnavailableSkill }>();
</script>

<template>
  <div class="skill" :title="`${skill.name}（不可用）`">
    <GameIcon :icon-id="skill.iconId" :alt="skill.name" class="icon" />
  </div>
</template>

<style scoped>
/* Same frame as SkillIcon; greyed out like an action the game does not let you use. */
.skill {
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
  filter: grayscale(1) brightness(0.55);
}
</style>
