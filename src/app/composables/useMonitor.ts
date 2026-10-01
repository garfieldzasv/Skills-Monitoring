import { computed, ref, shallowReactive, shallowRef, watch } from "vue";
import type { CooldownState } from "@/core/cooldown/cooldownTracker";
import { announcementOf, isSilenced } from "@/core/engine/announce";
import { DEMO_PARTY, DEMO_SELF_ID } from "@/core/engine/demoParty";
import { MonitorEngine, type MemberRow } from "@/core/engine/monitorEngine";
import { addOverlayListener, say } from "@/core/overlay/overlayApi";
import type { PartyMember } from "@/core/party/sortParty";
import { onOverlayCommand, publishLiveParty } from "./useOverlayBridge";
import { useLayout, useSettings } from "./useSettings";

/**
 * Vue adapter around the framework-agnostic engine. Created once, by the overlay page.
 *
 * Reactivity is deliberately narrow: rows are a shallow ref replaced on party/settings changes,
 * and cooldown states live in a shallowReactive Map, so a cast re-renders exactly one row.
 */
function createMonitor() {
  const settings = useSettings();
  const engine = new MonitorEngine(settings.state.value);

  const cooldowns = shallowReactive(new Map<string, CooldownState>());
  engine.cooldowns.subscribe((key, state) => {
    if (state) cooldowns.set(key, state);
    else cooldowns.delete(key);
  });

  const rows = shallowRef<readonly MemberRow[]>(engine.getRows());
  engine.onRowsChange((next) => (rows.value = next));
  watch(settings.state, (s) => engine.setSettings(s));

  // The switch lives in this overlay's layout, so a second overlay (?profile=) stays quiet
  // unless it is switched on there too.
  const layout = useLayout();
  engine.onTrigger((trigger) => {
    const { announce, announceText } = layout.state.value;
    if (!announce || isSilenced(trigger, settings.state.value.silentActions)) return;
    say(announcementOf(trigger, announceText));
  });

  // The real party/self are kept while the demo party is shown, and restored afterwards.
  const realParty = shallowRef<PartyMember[]>([]);
  let realSelfId = "";
  const demo = ref(false);

  watch(demo, (on) => {
    engine.setSelf(on ? DEMO_SELF_ID : realSelfId);
    engine.setParty(on ? DEMO_PARTY : realParty.value);
  });

  // Both events are cached by OverlayPlugin, so they arrive right after subscribing.
  addOverlayListener("PartyChanged", (e) => {
    realParty.value = e.party
      .filter((m) => m.inParty)
      .map((m) => ({ id: m.id, name: m.name, job: m.job, level: m.level }));
    if (!demo.value) engine.setParty(realParty.value);
  });
  addOverlayListener("ChangePrimaryPlayer", (e) => {
    realSelfId = e.charID.toString(16).toUpperCase();
    if (!demo.value) engine.setSelf(realSelfId);
  });
  addOverlayListener("ChangeZone", () => engine.reset());
  addOverlayListener("LogLine", (e) => engine.handleLogLine(e.line));

  // The settings window shows the displayed order (for manual reordering) and sends commands.
  watch(
    rows,
    (list) =>
      publishLiveParty({
        members: list.map(({ member }) => ({ id: member.id, name: member.name, job: member.job })),
        demo: demo.value,
      }),
    { immediate: true },
  );

  function castAll() {
    for (const row of rows.value) {
      for (const slot of row.slots) {
        if (slot.skill) engine.simulateCast(row.member.id, slot.skill.actionId);
      }
    }
  }
  onOverlayCommand((command) => {
    if (command === "castAll") castAll();
    else if (command === "reset") engine.reset();
    else say("语音播报测试");
  });

  return {
    rows,
    cooldowns,
    demo,
    realPartySize: computed(() => realParty.value.length),
  };
}

let instance: ReturnType<typeof createMonitor> | undefined;

export function useMonitor() {
  instance ??= createMonitor();
  return instance;
}
