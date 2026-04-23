import type {
  LevelEnum,
  PositionGroupEnum,
  SexEnum,
  SportEnum,
  TestTypeEnum,
} from "@/types/database";

export const SEX_OPTIONS: ReadonlyArray<{ value: SexEnum; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export const SPORT_OPTIONS: ReadonlyArray<{ value: SportEnum; label: string }> = [
  { value: "rugby_union", label: "Rugby Union" },
  { value: "rugby_league", label: "Rugby League" },
  { value: "rugby_sevens", label: "Rugby Sevens" },
  { value: "rugby_touch", label: "Rugby Touch" },
  { value: "afl", label: "AFL" },
  { value: "soccer", label: "Soccer" },
  { value: "basketball", label: "Basketball" },
  { value: "track", label: "Track" },
  { value: "other", label: "Other" },
];

export const LEVEL_OPTIONS: ReadonlyArray<{ value: LevelEnum; label: string }> = [
  { value: "developmental", label: "Developmental" },
  { value: "club", label: "Club" },
  { value: "semi_pro", label: "Semi-pro" },
  { value: "pro", label: "Pro" },
  { value: "international", label: "International" },
];

export const POSITION_GROUP_OPTIONS: ReadonlyArray<{
  value: PositionGroupEnum;
  label: string;
}> = [
  { value: "forward", label: "Forward" },
  { value: "back", label: "Back" },
  { value: "hit_up_forward", label: "Hit-up forward (RL)" },
  { value: "adjustable", label: "Adjustable (RL)" },
  { value: "outside_back", label: "Outside back (RL)" },
  { value: "other", label: "Other" },
];

export const TEST_TYPE_OPTIONS: ReadonlyArray<{
  value: TestTypeEnum;
  label: string;
}> = [
  { value: "unresisted_sprint", label: "Unresisted sprint" },
  { value: "resisted_sprint", label: "Resisted sprint" },
  { value: "assisted_sprint", label: "Assisted sprint" },
  { value: "acceleration_to_deceleration", label: "Accel → decel" },
  { value: "load_velocity_profile", label: "Load–velocity profile" },
  { value: "multi_load_fv_profile", label: "Multi-load F–V profile" },
  { value: "other", label: "Other" },
];
