export const HOME_GREETING_KEYS = {
  morning: "page.home.greeting.morning",
  afternoon: "page.home.greeting.afternoon",
  evening: "page.home.greeting.evening",
} as const;

export type HomeGreetingPeriod = keyof typeof HOME_GREETING_KEYS;

export function homeGreetingPeriod(date: Date): HomeGreetingPeriod {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
