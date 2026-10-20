import { useState } from "react";
import { Icon } from "../../components/Icon";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-soft inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? (
        <>
          <Icon name="check" size={13} className="text-emerald-600 dark:text-emerald-400" /> Copied
        </>
      ) : (
        label
      )}
    </button>
  );
}
