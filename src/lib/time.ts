export function hoursSince(date: Date | null | undefined, now = new Date()) {
  return date ? (now.getTime() - date.getTime()) / 3_600_000 : 0;
}

export function formatDuration(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatDateTime(date: Date) {
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export function startOfTodayIST(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3_600_000);
}
