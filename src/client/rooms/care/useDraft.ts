// A Concierge draft: ask, "Rewrite" for a fresh answer, and wait politely while Claude's session works.
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type Resp = { pending: boolean; reply?: string; response?: string };

export function useDraft(path: string) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const last = useRef<{ body: Record<string, unknown>; attempt: number } | null>(null);
  const attempt = useRef(0);

  const send = async (body: Record<string, unknown>, at: number, quiet = false) => {
    last.current = { body, attempt: at };
    if (!quiet) setBusy(true);
    setError(null);
    try {
      const r = await api.post<Resp>(path, { ...body, attempt: at });
      if (r.pending) setPending(true);
      else {
        setPending(false);
        setText(r.reply ?? r.response ?? "");
      }
    } catch (e) {
      setPending(false);
      setError(e);
    } finally {
      if (!quiet) setBusy(false);
    }
  };

  // While Claude works on it, check back every 20 seconds.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => last.current && send(last.current.body, last.current.attempt, true), 20_000);
    return () => clearInterval(t);
  }, [pending]);

  return {
    text,
    setText,
    pending,
    busy,
    error,
    /** First draft for these inputs. */
    draft: (body: Record<string, unknown>) => send(body, attempt.current),
    /** A fresh answer for the same inputs. */
    rewrite: (body: Record<string, unknown>) => send(body, ++attempt.current),
    reset: () => {
      setText("");
      setPending(false);
      setError(null);
      last.current = null;
    },
  };
}
