import { getAction } from "@/core/game/actions";
import { getJob, toAdvancedJob } from "@/core/game/jobs";
import type { AnnounceText, Settings } from "@/core/settings/schema";
import type { SkillTrigger } from "./monitorEngine";

/**
 * The words spoken for a trigger. The skill name is the action actually cast, so a one-step
 * finish is announced as such rather than as the slot's 四色技巧舞步结束.
 */
export function announcementOf(trigger: SkillTrigger, kind: AnnounceText): string {
  const skill = getAction(trigger.castActionId)?.name ?? trigger.skill.name;
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
