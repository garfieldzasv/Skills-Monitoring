<script setup lang="ts">
import { computed, ref } from "vue";
import { getAction, getAllActionIds } from "@/core/game/actions";
import { getJob } from "@/core/game/jobs";
import { evalLevelValue, MAX_LEVEL } from "@/core/game/levelValue";
import { timerOwner, topOfChain } from "@/core/game/upgrades";
import GameIcon from "@/app/components/common/GameIcon.vue";

const props = defineProps<{ jobId: number; exclude: readonly number[] }>();
const emit = defineEmits<{ pick: [actionId: number]; close: [] }>();

const query = ref("");
const onlyAbilities = ref(true);

interface PickerItem {
  id: number;
  name: string;
  icon: number;
  level: number;
  /** At max level. */
  recast: number;
  charges: number;
}

/** Actions this job can use, top tier of each upgrade chain only (lower tiers resolve by level). */
const pool = computed<PickerItem[]>(() => {
  const list: PickerItem[] = [];
  for (const id of getAllActionIds()) {
    const a = getAction(id)!;
    if (!a.jobs.includes(props.jobId) || topOfChain(id) !== id) continue;
    const timer = timerOwner(a);
    const recast = evalLevelValue(timer.recast, MAX_LEVEL);
    list.push({ id, name: a.name, icon: a.icon, level: a.level, recast, charges: evalLevelValue(timer.charges, MAX_LEVEL) });
  }
  return list.sort((a, b) => Number(b.recast >= 30) - Number(a.recast >= 30) || a.level - b.level);
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return pool.value.filter((a) => {
    if (onlyAbilities.value && a.recast < 30 && a.charges <= 1) return false;
    return !q || a.name.toLowerCase().includes(q) || String(a.id).includes(q);
  });
});
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true">
      <header>
        <strong>为 {{ getJob(jobId)?.name }} 添加技能</strong>
        <button type="button" class="btn" @click="emit('close')">关闭</button>
      </header>
      <div class="filters">
        <input v-model="query" type="search" placeholder="搜索技能名或 ID" autofocus />
        <label><input v-model="onlyAbilities" type="checkbox" /> 只看冷却 ≥ 30 秒或有充能的技能</label>
      </div>
      <ul class="grid">
        <li v-for="a in filtered" :key="a.id">
          <button type="button" :disabled="exclude.includes(a.id)" @click="emit('pick', a.id)">
            <GameIcon :icon-id="a.icon" :alt="a.name" class="icon" />
            <span class="name">{{ a.name }}</span>
            <span class="meta">Lv{{ a.level }} · {{ a.recast }}s{{ a.charges > 1 ? ` ×${a.charges}` : "" }}</span>
          </button>
        </li>
      </ul>
      <p v-if="filtered.length === 0" class="empty">没有匹配的技能</p>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 55%);
}

.dialog {
  width: min(900px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
}

header,
.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.filters input[type="search"] {
  flex: 1;
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 6px;
}

.grid button {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 1fr;
  grid-template-rows: auto auto;
  column-gap: 8px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.grid button:hover:not(:disabled) {
  border-color: var(--accent);
}

.grid button:disabled {
  opacity: 0.4;
  cursor: default;
}

.icon {
  grid-row: span 2;
  width: 32px;
  height: 32px;
  border-radius: 4px;
}

.meta,
.empty {
  color: var(--text-muted);
  font-size: 11px;
}
</style>
