import { useEffect, useRef } from "react";
import type { ExtensionNotification } from "../useAgent";

const STYLES: Record<NonNullable<ExtensionNotification["notifyType"]>, string> = {
  info: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200",
  warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  error: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200",
};

const DISMISS_AFTER_MS = 6000;

function NotificationToast({ notification, onDismiss }: { notification: ExtensionNotification; onDismiss: () => void }) {
  // The callback lives in a ref, and the timer depends on the notification's id
  // alone. Depending on the callback looks equivalent and is not: the parent
  // hands down a fresh closure on every render, so the effect used to tear its
  // timer down and start a new one each time anything above it re-rendered.
  // Under a streaming answer — or any Work Plan update — that happens far more
  // often than once every six seconds, and the toast never expired: it sat over
  // the Work Plan panel until the page was reloaded.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [notification.id]);

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${STYLES[notification.notifyType ?? "info"]}`}
    >
      <span className="min-w-0 flex-1 break-words">{notification.message}</span>
      {/* The escape hatch: whatever else goes wrong, a toast covering the panel
          behind it is one click away from gone. */}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss.current()}
        className="-mr-1 shrink-0 rounded px-1 leading-5 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/** Toast stack for extension notify() calls — see extensions.md#custom-ui. */
export function ExtensionNotifications({
  notifications,
  onDismiss,
}: {
  notifications: ExtensionNotification[];
  onDismiss: (id: string) => void;
}) {
  if (notifications.length === 0) return null;
  return (
    <div className="fixed right-4 top-16 z-40 flex w-80 flex-col gap-2">
      {notifications.map((n) => (
        <NotificationToast key={n.id} notification={n} onDismiss={() => onDismiss(n.id)} />
      ))}
    </div>
  );
}
