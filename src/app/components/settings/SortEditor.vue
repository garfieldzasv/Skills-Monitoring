<script setup lang="ts">
import { computed, ref } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { getRoleGroup, ROLE_GROUPS, type RoleGroup } from "@/core/game/jobs";
import type { PartySortSettings } from "@/core/party/sortParty";
import JobBadge from "@/app/components/common/JobBadge.vue";
import { useSettings } from "@/app/composables/useSettings";
import CurrentPartyOrder from "./CurrentPartyOrder.vue";

const settings = useSettings();
const ROLE_LABEL: Record<RoleGroup, string> = { tank: "防护职业", healer: "治疗职业", dps: "进攻职业" };
const PRESET_LABEL: Record<RoleGroup, string> = { tank: "我是防护时", healer: "我是治疗时", dps: "我是进攻时" };

const presetKey = ref<RoleGroup>("tank");
const sort = computed(() => settings.state.value.partySort);
const preset = computed(() => sort.value.presets[presetKey.value]);

function updateSort(mutate: (s: PartySortSettings) => void) {
  settings.update((d) => mutate(d.partySort));
}

const roleItems = computed({
  get: () => preset.value.roleOrder.map((g) => ({ id: g })),
  set: (list) =>
    updateSort((s) => {
      s.presets[presetKey.value].roleOrder = list.map((x) => x.id);
    }),
});

/** Jobs are dragged within their own role group; the full order is the concatenation. */
function jobItems(group: RoleGroup) {
  return computed({
    get: () => preset.value.jobOrder.filter((j) => getRoleGroup(j) === group).map((id) => ({ id })),
    set: (list) =>
      updateSort((s) => {
        const p = s.presets[presetKey.value];
        const byGroup = Object.fromEntries(ROLE_GROUPS.map((g) => [g, p.jobOrder.filter((j) => getRoleGroup(j) === g)]));
        byGroup[group] = list.map((x) => x.id);
        p.jobOrder = ROLE_GROUPS.flatMap((g) => byGroup[g]!);
      }),
  });
}
const jobLists = Object.fromEntries(ROLE_GROUPS.map((g) => [g, jobItems(g)])) as Record<RoleGroup, ReturnType<typeof jobItems>>;

function copyToOthers() {
  updateSort((s) => {
    const src = s.presets[presetKey.value];
    for (const g of ROLE_GROUPS) s.presets[g] = structuredClone(src);
  });
}
</script>

<template>
  <div class="sort-editor">
    <CurrentPartyOrder />
    <section class="general">
      <label>
        <input
          type="checkbox"
          :checked="sort.selfFirst"
          @change="updateSort((s) => (s.selfFirst = ($event.target as HTMLInputElement).checked))"
        />
        自己固定在第一行
      </label>
      <label>
        同职业的先后顺序：
        <select
          :value="sort.sameJobTieBreak"
          @change="updateSort((s) => (s.sameJobTieBreak = ($event.target as HTMLSelectElement).value as PartySortSettings['sameJobTieBreak']))"
        >
          <option value="actorIdDesc">ActorID 从大到小（默认）</option>
          <option value="actorIdAsc">ActorID 从小到大</option>
        </select>
      </label>
      <p class="muted">
        和游戏里“小队列表排序”的设置保持一致。游戏按你自己当前的职能使用不同的排序，这里同样有三套预设。
        规则对不上时（例如同职业），在上方“当前小队的顺序”里手动调整。
      </p>
    </section>

    <nav class="tabs">
      <button
        v-for="g in ROLE_GROUPS"
        :key="g"
        type="button"
        :class="{ active: g === presetKey }"
        @click="presetKey = g"
      >
        {{ PRESET_LABEL[g] }}
      </button>
      <button type="button" class="btn copy" @click="copyToOthers">复制到其他预设</button>
    </nav>

    <section>
      <h4>职能顺序</h4>
      <VueDraggable v-model="roleItems" class="chips" :animation="150">
        <span v-for="item in roleItems" :key="item.id" class="chip">{{ ROLE_LABEL[item.id] }}</span>
      </VueDraggable>
    </section>

    <section v-for="g in preset.roleOrder" :key="g">
      <h4>{{ ROLE_LABEL[g] }}内的职业顺序</h4>
      <VueDraggable v-model="jobLists[g].value" class="chips" :animation="150">
        <span v-for="item in jobLists[g].value" :key="item.id" class="chip">
          <JobBadge :job-id="item.id" />
        </span>
      </VueDraggable>
    </section>
  </div>
</template>

<style scoped>
.sort-editor {
  display: grid;
  gap: 16px;
  max-width: 900px;
}

.general {
  display: grid;
  gap: 8px;
}

.tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--border);
}

.tabs button:not(.copy) {
  padding: 6px 14px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.tabs button.active {
  border-color: var(--border);
  background: var(--bg);
  color: var(--text);
}

.copy {
  margin-left: auto;
  margin-bottom: 4px;
}

h4 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 500;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  cursor: grab;
}

.muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
