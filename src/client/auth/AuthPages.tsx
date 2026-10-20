import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ErrorNote } from "../components/ui";
import { CopyButton } from "../rooms/shared/CopyButton";
import { Logo } from "../components/Logo";
import { Icon } from "../components/Icon";

export interface AuthStatus {
  passwordSet: boolean;
  authed: boolean;
  secrets: { sessionSecret: boolean; vaultMasterKey: boolean };
}

export function useAuthStatus() {
  return useQuery({ queryKey: ["auth"], queryFn: () => api.get<AuthStatus>("/auth/status"), staleTime: 10_000 });
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-night">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo size={40} className="mx-auto" />
          <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
        </div>
        <div className="card p-6 shadow-[0_1px_3px_rgba(16,24,40,0.06)] sm:p-7">{children}</div>
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">BinkSuite</p>
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
    <Shell title="Sign in to BinkSuite" subtitle="Enter your password to continue.">
      <form
        className="space-y-4"
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
          <input className="input" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <ErrorNote error={error} />
        <button className="btn-primary w-full py-2.5" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
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
      <Shell title="Already set up" subtitle="Your password is already set.">
        {!secretsOk && <MissingSecrets status={status} fresh={fresh} onCheck={() => refetch()} />}
        <button className="btn-primary mt-4 w-full" onClick={() => nav("/login")}>
          Go to login
        </button>
      </Shell>
    );
  }

  return (
    <Shell title="Set up BinkSuite" subtitle={secretsOk ? "Step 2 of 2: choose your password." : "Step 1 of 2: add your secrets."}>
      <ol className="mb-5 grid grid-cols-2 gap-2 text-xs font-medium">
        <SetupStep n={1} label="Secrets" active={!secretsOk} done={secretsOk} />
        <SetupStep n={2} label="Password" active={secretsOk} done={false} />
      </ol>
      {!status ? (
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Checking…</p>
      ) : !secretsOk ? (
        <MissingSecrets status={status} fresh={fresh} onCheck={() => refetch()} />
      ) : (
        <form
          className="space-y-4"
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
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Choose the password you'll use to sign in. Use 10+ characters — a short sentence is easy to remember.</p>
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
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">Proves it's you setting the password, not a stranger who found the URL.</span>
          </label>
          <ErrorNote error={error} />
          <button className="btn-primary w-full py-2.5" disabled={busy || password.length < 10 || !setupCode}>
            {busy ? "Setting up…" : "Create password and continue"}
          </button>
        </form>
      )}
    </Shell>
  );
}

function MissingSecrets({ status, fresh, onCheck }: { status: AuthStatus; fresh: { session: string; vault: string }; onCheck: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">Your Worker needs two secrets before it can log you in. I've made two random values for you:</p>
      {[
        ["SESSION_SECRET", fresh.session, status.secrets.sessionSecret],
        ["VAULT_MASTER_KEY", fresh.vault, status.secrets.vaultMasterKey],
      ].map(([name, value, ok]) => (
        <div key={name as string} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold">{name as string}</span>
            {ok ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <Icon name="check" size={13} /> Set
              </span>
            ) : (
              <CopyButton text={value as string} />
            )}
          </div>
          {!ok && <div className="mt-1.5 break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">{value as string}</div>}
        </div>
      ))}
      <ol className="list-decimal space-y-1 pl-5 text-zinc-600 marker:text-zinc-400 dark:text-zinc-300">
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
        I've added them, check again
      </button>
    </div>
  );
}

function SetupStep({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${active ? "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100" : "border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400"}`}
    >
      <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${done ? "bg-emerald-500 text-white" : active ? "bg-accent text-white" : "bg-zinc-100 dark:bg-white/10"}`}>
        {done ? <Icon name="check" size={12} /> : n}
      </span>
      {label}
    </li>
  );
}
