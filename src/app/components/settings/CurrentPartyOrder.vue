<script setup lang="ts">
import { computed } from "vue";
import { clearManualOrder, memberKey, saveManualOrder } from "@/core/party/sortParty";
import JobBadge from "@/app/components/common/JobBadge.vue";
import { useLiveParty } from "@/app/composables/useOverlayBridge";
import { useSettings } from "@/app/composables/useSettings";

const settings = useSettings();
const live = useLiveParty();

const members = computed(() => live.value?.members ?? []);
const key = computed(() => memberKey(members.value));
const hasManual = computed(() => settings.state.value.manualOrders.some((o) => o.memberKey === key.value));

/** Swaps two rows of the order the overlay is showing and saves it for this member set. */
function move(index: number, delta: -1 | 1) {
  const order = members.value.map((m) => m.id);
  const target = index + delta;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target]!, order[index]!];
  settings.update((d) => {
    d.manualOrders = saveManualOrder(d.manualOrders, order, Date.now());
  });
}

function clear() {
  const k = key.value;
  settings.update((d) => {
    d.manualOrders = clearManualOrder(d.manualOrders, k);
  });
}
</script>

<template>
  <section class="current">
    <h4>
      当前小队的顺序
      <span v-if="live?.demo" class="tag">演示小队</span>
      <span v-if="hasManual" class="tag manual">手动顺序</span>
    </h4>
    <p class="muted">
      规则排出来的顺序和游戏对不上时（例如同职业），在这里上下调整。调整结果只对这组队员生效，队员变化后自动回到规则排序。
    </p>
    <p v-if="members.length === 0" class="muted">
      没有收到悬浮窗的小队信息。请从悬浮窗右键打开本页，并确认悬浮窗正在运行。
    </p>
    <ol v-else class="list">
      <li v-for="(m, i) in members" :key="m.id">
        <span class="index">{{ i + 1 }}</span>
        <JobBadge :job-id="m.job" />
        <span class="name">{{ m.name }}</span>
        <button type="button" class="btn" :disabled="i === 0" title="上移" @click="move(i, -1)">▲</button>
        <button type="button" class="btn" :disabled="i === members.length - 1" title="下移" @click="move(i, 1)">▼</button>
      </li>
    </ol>
    <div>
      <button type="button" class="btn" :disabled="!hasManual" @click="clear">清除手动顺序</button>
    </div>
  </section>
</template>

<style scoped>
.current {
  display: grid;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.tag {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: normal;
}

.tag.manual {
  color: var(--accent);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
  max-width: 480px;
}

.list li {
  display: grid;
  grid-template-columns: 20px 110px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg);
}

.index {
  color: var(--text-muted);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list .btn {
  padding: 0 8px;
}

.muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
