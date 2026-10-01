<script setup lang="ts">
import { ref, watch } from "vue";
import { isValidLevelValue, type LevelValue } from "@/core/game/levelValue";

/**
 * Edits a LevelValue as text: "90" for a constant, or "1:120, 88:90" for level breakpoints.
 * Empty input means "no override".
 */
const props = defineProps<{ modelValue: LevelValue | undefined; placeholder?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: LevelValue | undefined] }>();

function format(v: LevelValue | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "number") return String(v);
  return v.map(([lv, value]) => `${lv}:${value}`).join(", ");
}

function parse(text: string): LevelValue | undefined | null {
  const t = text.trim();
  if (t === "") return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const points = t.split(/[,，\s]+/).filter(Boolean).map((p) => p.split(/[:：]/).map(Number));
  if (points.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))) return null;
  const value = points.map(([lv, v]) => [lv!, v!] as const);
  return isValidLevelValue(value) ? value : null;
}

const text = ref(format(props.modelValue));
const invalid = ref(false);
watch(
  () => props.modelValue,
  (v) => {
    if (JSON.stringify(parse(text.value)) !== JSON.stringify(v)) text.value = format(v);
  },
);

function commit() {
  const parsed = parse(text.value);
  invalid.value = parsed === null;
  if (parsed !== null) emit("update:modelValue", parsed);
}
</script>

<template>
  <input
    v-model="text"
    class="level-value"
    :class="{ invalid }"
    :placeholder="placeholder"
    title="固定值如 90；按等级分段如 1:120, 88:90"
    @change="commit"
  />
</template>

<style scoped>
.level-value {
  width: 100%;
  font-variant-numeric: tabular-nums;
}

.invalid {
  border-color: var(--danger) !important;
}
</style>
