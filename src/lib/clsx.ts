type ClassValue = string | number | null | false | undefined | ClassValue[];

export function clsx(...args: ClassValue[]): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (Array.isArray(a)) out.push(clsx(...a));
    else out.push(String(a));
  }
  return out.join(" ");
}
