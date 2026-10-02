import { getJob, toAdvancedJob } from "@/core/game/jobs";
import type { AnnounceText, Settings } from "@/core/settings/schema";
import type { SkillTrigger } from "./monitorEngine";

/**
 * The words spoken for a trigger. The skill is named as in the slot (the member's tier of it),
 * not after the variant the game swapped in: 技巧舞步结束, however many steps were danced.
 */
export function announcementOf(trigger: SkillTrigger, kind: AnnounceText): string {
  const skill = trigger.skill.name;
  const who =
    kind === "jobAndSkill" ? getJob(trigger.member.job)?.name
    : kind === "memberAndSkill" ? trigger.member.name
    : undefined;
  return who ? `${who} ${skill}` : skill;
}

/** Whether the slot was switched off for announcements (per advanced job, like the slots). */
export function isSilenced(trigger: SkillTrigger, silentActions: Settings["silentActions"]): boolean {
  return silentActions[toAdvancedJob(trigger.member.job)]?.includes(trigger.skill.slotActionId) ?? false;
}
