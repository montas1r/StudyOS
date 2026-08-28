/**
 * Desktop notification helpers for timer completion.
 *
 * - Lazily requests Notification.permission on first use
 * - Only fires when the document is hidden (tab backgrounded / minimized)
 * - Gracefully no-ops when notifications are denied or unavailable
 */

/** True when the browser tab is not visible / not focused */
function isTabBlurred(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/** Current permission state without prompting */
function permissionStatus(): NotificationPermission | "unavailable" {
  if (typeof Notification === "undefined") return "unavailable";
  return Notification.permission;
}

/**
 * Ensure we have permission.  Returns true if granted, false otherwise.
 * Only prompts once — subsequent calls are free.
 */
async function ensurePermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  // "default" — ask the user (browser will show a prompt bar)
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Fire a desktop notification.  No-ops silently if:
 *   - Tab is currently focused (user can see the app)
 *   - Notifications are denied or unavailable
 */
export async function sendCompletionNotification(
  phase: "work" | "rest",
  modeLabel: string,
): Promise<void> {
  if (!isTabBlurred()) return; // user is looking at the app — skip

  const granted = await ensurePermission();
  if (!granted) return;

  const isWork = phase === "work";
  const title = isWork ? "Focus session complete!" : "Break is over!";
  const body = isWork
    ? `${modeLabel} session finished — time for a break.`
    : `Break ended — ready for your next focus block?`;

  try {
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "studyos-timer",   // replaces previous notification instead of stacking
    });
    // Auto-close after 8 seconds
    setTimeout(() => n.close(), 8_000);
  } catch {
    // Notification constructor can throw in some restricted contexts
  }
}

/**
 * Prompt the user for notification permission eagerly.
 * Call this from a user-gesture handler (button click, etc.)
 * so the browser doesn't block the prompt.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  return ensurePermission();
}
