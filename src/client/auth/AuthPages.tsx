import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ErrorNote } from "../components/ui";
import { CopyButton } from "../rooms/shared/CopyButton";
import { Logo } from "../components/Logo";

export interface AuthStatus {
  passwordSet: boolean;
  authed: boolean;
  secrets: { sessionSecret: boolean; vaultMasterKey: boolean };
}

export function useAuthStatus() {
  return useQuery({ queryKey: ["auth"], queryFn: () => api.get<AuthStatus>("/auth/status"), staleTime: 10_000 });
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="floor-boards flex min-h-dvh items-center justify-center bg-[#efe3cf] p-4 dark:bg-night">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 text-center">
          <Logo size={72} className="mx-auto drop-shadow" />
          <h1 className="text-2xl font-black">BinkSuite HQ</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  return (
    <Shell>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.post("/auth/login", { password });
            await qc.invalidateQueries();
            nav("/", { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <span className="label">Password</span>
          <input className="input text-lg" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <ErrorNote error={error} />
        <button className="btn-primary w-full py-3 text-base" disabled={busy || !password}>
          {busy ? "Opening…" : "Clock in 🔑"}
        </button>
      </form>
    </Shell>
  );
}

function randomSecret() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function SetupPage() {
  const { data: status, refetch } = useAuthStatus();
  const secretsOk = !!status && status.secrets.sessionSecret && status.secrets.vaultMasterKey;
  // Generated in your browser — the server never sees these until you paste them into Cloudflare.
  const fresh = useMemo(() => ({ session: randomSecret(), vault: randomSecret() }), []);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  if (status?.passwordSet) {
    return (
      <Shell>
        <p className="text-center">Your password is already set.</p>
        {!secretsOk && <MissingSecrets status={status} fresh={fresh} onCheck={() => refetch()} />}
        <button className="btn-primary mt-4 w-full" onClick={() => nav("/login")}>
          Go to login
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <ol className="mb-4 flex justify-center gap-2 text-xs font-black">
        <li className={`chip px-3 py-1 ${secretsOk ? "bg-mint text-white" : "bg-honey/40"}`}>1 · Secrets {secretsOk ? "✓" : ""}</li>
        <li className={`chip px-3 py-1 ${secretsOk ? "bg-honey/40" : ""}`}>2 · Password</li>
      </ol>
      {!status ? (
        <p className="text-center">Checking…</p>
      ) : !secretsOk ? (
        <MissingSecrets status={status} fresh={fresh} onCheck={() => refetch()} />
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password !== confirmPw) return setError(new Error("The two passwords don't match"));
            setBusy(true);
            setError(null);
            try {
              await api.post("/auth/setup", { password, setupCode });
              await qc.invalidateQueries();
              nav("/", { replace: true });
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-sm">Choose the password you'll use to open your HQ. Use 10+ characters — a short sentence is easy to remember.</p>
          <label className="block">
            <span className="label">New password</span>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Type it again</span>
            <input className="input" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Setup code = your SESSION_SECRET value</span>
            <input className="input font-mono" autoComplete="off" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} placeholder="Paste the SESSION_SECRET you saved" />
            <span className="mt-1 block text-xs text-cocoa dark:text-stone-400">Proves it's you setting the password, not a stranger who found the URL.</span>
          </label>
          <ErrorNote error={error} />
          <button className="btn-primary w-full py-3 text-base" disabled={busy || password.length < 10 || !setupCode}>
            {busy ? "Setting up your HQ…" : "Create password & open HQ ✨"}
          </button>
        </form>
      )}
    </Shell>
  );
}

function MissingSecrets({ status, fresh, onCheck }: { status: AuthStatus; fresh: { session: string; vault: string }; onCheck: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold">Your Worker needs two secrets before it can log you in. I've made two random values for you:</p>
      {[
        ["SESSION_SECRET", fresh.session, status.secrets.sessionSecret],
        ["VAULT_MASTER_KEY", fresh.vault, status.secrets.vaultMasterKey],
      ].map(([name, value, ok]) => (
        <div key={name as string} className="rounded-xl bg-black/5 p-2.5 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-black">{name as string}</span>
            {ok ? <span className="chip bg-mint/30">✓ set</span> : <CopyButton text={value as string} />}
          </div>
          {!ok && <div className="mt-1 break-all font-mono text-[11px]">{value as string}</div>}
        </div>
      ))}
      <ol className="list-decimal space-y-1 pl-5">
        <li>Save both values somewhere safe (a password manager or notes app).</li>
        <li>Cloudflare dashboard → <b>Workers &amp; Pages</b> → <b>binksuite</b> → <b>Settings</b> → <b>Variables and Secrets</b>.</li>
        <li>
          Click <b>+ Add</b>, Type: <b>Secret</b>, name <code>SESSION_SECRET</code>, paste the value, <b>Deploy</b>.
        </li>
        <li>
          Repeat for <code>VAULT_MASTER_KEY</code>.
        </li>
        <li>Come back here and press the button below.</li>
      </ol>
      <button className="btn-primary w-full" onClick={onCheck}>
        I've added them — check again
      </button>
    </div>
  );
}
