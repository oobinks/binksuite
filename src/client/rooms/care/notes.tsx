// Small shared notes for the Customer Care room.
import { Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";

export function NeverSends() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
      <Icon name="lock" size={13} className="mt-px shrink-0" />
      BinkSuite never sends messages. Copy this into Etsy.
    </p>
  );
}

export function PendingNote() {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
      <Spinner /> Added to Claude's to-do list. The draft appears here when Claude's session finishes.
    </p>
  );
}
