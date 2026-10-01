<script setup lang="ts">
import { computed, ref } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { getAction } from "@/core/game/actions";
import { ADVANCED_JOB_IDS, getRoleGroup, ROLE_GROUPS, type RoleGroup } from "@/core/game/jobs";
import { resolveSkill } from "@/core/game/skillMeta";
import { DEFAULT_WATCH_ACTIONS } from "@/data/defaultWatchActions";
import GameIcon from "@/app/components/common/GameIcon.vue";
import JobBadge from "@/app/components/common/JobBadge.vue";
import { useSettings } from "@/app/composables/useSettings";
import ActionPicker from "./ActionPicker.vue";

const settings = useSettings();
const selectedJob = ref(ADVANCED_JOB_IDS[0]!);
const picking = ref(false);

const ROLE_LABEL: Record<RoleGroup, string> = { tank: "防护", healer: "治疗", dps: "进攻" };
const jobsByGroup = computed(() =>
  ROLE_GROUPS.map((g) => ({ group: g, jobs: ADVANCED_JOB_IDS.filter((j) => getRoleGroup(j) === g) })),
);

const slots = computed(() => settings.state.value.watchActions[selectedJob.value] ?? []);

/** Draggable needs objects; ids are unique per job (validation removes duplicates). */
const items = computed({
  get: () => slots.value.map((id) => ({ id, ...describe(id) })),
  set: (list) => setSlots(list.map((x) => x.id)),
});

function setSlots(ids: number[]) {
  const job = selectedJob.value;
  settings.update((d) => {
    d.watchActions[job] = ids;
  });
}

function describe(id: number) {
  const skill = resolveSkill(id, selectedJob.value, 100, (a) => settings.state.value.skillOverrides[a]);
  const action = getAction(id);
  return {
    name: skill?.name ?? action?.name ?? `#${id}`,
    iconId: skill?.iconId ?? action?.icon ?? 0,
    detail: skill
      ? `${skill.recastMs / 1000}s${skill.maxCharges > 1 ? ` ×${skill.maxCharges}` : ""}${skill.durationMs ? ` · 持续 ${skill.durationMs / 1000}s` : ""}`
      : "该职业无法使用",
  };
}

function pick(id: number) {
  setSlots([...slots.value, id]);
  picking.value = false;
}
</script>

<template>
  <div class="slot-editor">
    <nav class="jobs">
      <section v-for="g in jobsByGroup" :key="g.group">
        <h4>{{ ROLE_LABEL[g.group] }}</h4>
        <button
          v-for="job in g.jobs"
          :key="job"
          type="button"
          class="job"
          :class="{ active: job === selectedJob }"
          @click="selectedJob = job"
        >
          <JobBadge :job-id="job" />
          <span class="count">{{ settings.state.value.watchActions[job]?.length ?? 0 }}</span>
        </button>
      </section>
    </nav>

    <section class="slots">
      <header>
        <JobBadge :job-id="selectedJob" />
        <span class="muted">拖动调整顺序，同一行从左到右显示。基础职业自动沿用进阶职业的配置。</span>
      </header>
      <VueDraggable v-model="items" class="list" :animation="150" handle=".handle">
        <div v-for="item in items" :key="item.id" class="slot">
          <span class="handle" title="拖动排序">⋮⋮</span>
          <GameIcon :icon-id="item.iconId" class="icon" />
          <div class="info">
            <div>{{ item.name }}</div>
            <div class="muted">{{ item.detail }}</div>
          </div>
          <button type="button" class="btn danger" @click="setSlots(slots.filter((x) => x !== item.id))">移除</button>
        </div>
      </VueDraggable>
      <p v-if="slots.length === 0" class="muted">这个职业没有监视任何技能。</p>
      <div class="actions">
        <button type="button" class="btn primary" @click="picking = true">添加技能</button>
        <button type="button" class="btn" @click="setSlots([...(DEFAULT_WATCH_ACTIONS[selectedJob] ?? [])])">恢复默认</button>
        <button type="button" class="btn" @click="setSlots([])">清空</button>
      </div>
    </section>

    <ActionPicker v-if="picking" :job-id="selectedJob" :exclude="slots" @pick="pick" @close="picking = false" />
  </div>
</template>

<style scoped>
.slot-editor {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 16px;
  min-height: 0;
}

.jobs {
  display: grid;
  gap: 10px;
  align-content: start;
}

h4 {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}

.job {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: none;
  color: var(--text);
  cursor: pointer;
}

.job:hover {
  background: var(--bg);
}

.job.active {
  border-color: var(--accent);
  background: var(--bg);
}

.count {
  color: var(--text-muted);
  font-size: 11px;
}

.slots {
  display: grid;
  gap: 10px;
  align-content: start;
}

.slots header {
  display: flex;
  gap: 12px;
  align-items: center;
}

.list {
  display: grid;
  gap: 6px;
}

.slot {
  display: grid;
  grid-template-columns: 16px 36px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}

.handle {
  color: var(--text-muted);
  cursor: grab;
  letter-spacing: -2px;
}

.icon {
  width: 36px;
  height: 36px;
  border-radius: 4px;
}

.actions {
  display: flex;
  gap: 8px;
}

.muted {
  color: var(--text-muted);
  font-size: 12px;
}
</style>
