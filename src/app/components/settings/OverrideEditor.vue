<script setup lang="ts">
import { computed, ref } from "vue";
import { getAction } from "@/core/game/actions";
import type { LevelValue } from "@/core/game/levelValue";
import { gameValues, type SkillOverride } from "@/core/game/skillMeta";
import { topOfChain } from "@/core/game/upgrades";
import GameIcon from "@/app/components/common/GameIcon.vue";
import { useSettings } from "@/app/composables/useSettings";
import LevelValueInput from "./LevelValueInput.vue";

const settings = useSettings();
const query = ref("");

type ValueKey = "recast" | "duration" | "maxCharges";
const COLUMNS: { key: ValueKey; label: string }[] = [
  { key: "recast", label: "冷却（秒）" },
  { key: "duration", label: "持续（秒）" },
  { key: "maxCharges", label: "充能层数" },
];

function formatValue(v: LevelValue | undefined): string {
  if (v === undefined) return "";
  return typeof v === "number" ? String(v) : v.map(([lv, x]) => `${lv}:${x}`).join(", ");
}

/** Game-data value shown as placeholder. */
function builtinOf(id: number, key: ValueKey): string {
  const a = getAction(id);
  return a ? formatValue(gameValues(a)[key]) : "";
}

/** Every action used in any slot, plus anything that already has a user override. */
const rows = computed(() => {
  const s = settings.state.value;
  const ids = new Set<number>();
  Object.values(s.watchActions).forEach((list) => list.forEach((id) => ids.add(topOfChain(id))));
  Object.keys(s.skillOverrides).forEach((id) => ids.add(Number(id)));
  const q = query.value.trim();
  return [...ids]
    .map((id) => ({ id, action: getAction(id), override: s.skillOverrides[id] }))
    .filter((r) => r.action && (!q || r.action.name.includes(q) || String(r.id).includes(q)))
    .sort((a, b) => Number(!!b.override) - Number(!!a.override) || a.id - b.id);
});

function setField(id: number, key: keyof SkillOverride, value: LevelValue | number | undefined) {
  settings.update((d) => {
    const next: SkillOverride = { ...d.skillOverrides[id], [key]: value };
    if (value === undefined) delete next[key];
    if (Object.keys(next).length === 0) delete d.skillOverrides[id];
    else d.skillOverrides[id] = next;
  });
}

function onMinLevel(id: number, e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim();
  const n = Number(raw);
  setField(id, "minLevel", raw === "" || !Number.isInteger(n) || n <= 0 ? undefined : n);
}

function clear(id: number) {
  settings.update((d) => {
    delete d.skillOverrides[id];
  });
}
</script>

<template>
  <div class="override-editor">
    <p class="muted">
      留空表示使用游戏数据（灰色提示）。按等级变化的值写成 <code>1:120, 88:90</code>，表示 1 级起 120、88 级起 90。
    </p>
    <input v-model="query" type="search" placeholder="筛选技能名或 ID" class="search" />
    <table>
      <thead>
        <tr>
          <th colspan="2">技能</th>
          <th v-for="c in COLUMNS" :key="c.key">{{ c.label }}</th>
          <th>最低等级</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" :class="{ customized: r.override }">
          <td class="icon-cell"><GameIcon :icon-id="r.action!.icon" class="icon" /></td>
          <td>
            {{ r.action!.name }} <span class="muted">#{{ r.id }}</span>
          </td>
          <td v-for="c in COLUMNS" :key="c.key">
            <LevelValueInput
              :model-value="r.override?.[c.key]"
              :placeholder="builtinOf(r.id, c.key)"
              @update:model-value="(v) => setField(r.id, c.key, v)"
            />
          </td>
          <td>
            <input
              type="number"
              min="1"
              :value="r.override?.minLevel ?? ''"
              :placeholder="String(r.action!.level)"
              @change="onMinLevel(r.id, $event)"
            />
          </td>
          <td>
            <button v-if="r.override" type="button" class="btn" @click="clear(r.id)">重置</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.override-editor {
  display: grid;
  gap: 10px;
}

.search {
  max-width: 320px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-weight: normal;
}

th {
  color: var(--text-muted);
  font-size: 12px;
}

td input {
  width: 100%;
  min-width: 70px;
}

.icon-cell {
  width: 32px;
}

.icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: block;
}

tr.customized td:first-child {
  box-shadow: inset 3px 0 0 var(--accent);
}

.muted {
  color: var(--text-muted);
  font-size: 12px;
}
</style>
