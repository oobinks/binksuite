import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { Layout } from "./components/Layout";
import { HQPage } from "./hq/HQPage";
import { RoomPage } from "./rooms/RoomPage";
import { AgentPage } from "./agents/AgentPage";
import { JournalPage } from "./game/JournalPage";
import { SettingsPage } from "./settings/SettingsPage";
import { LoginPage, SetupPage, useAuthStatus } from "./auth/AuthPages";

function Gate() {
  const { data, isLoading, error } = useAuthStatus();
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    const onUnauth = () => nav("/login", { replace: true });
    window.addEventListener("bs:unauthorised", onUnauth);
    return () => window.removeEventListener("bs:unauthorised", onUnauth);
  }, [nav]);

  if (isLoading) return <p className="py-24 text-center text-lg font-bold">🏡</p>;
  if (error || !data) return <p className="py-24 text-center">Can't reach the server. Refresh in a moment.</p>;
  if (loc.pathname === "/setup") return <SetupPage />;
  if (!data.passwordSet) return <Navigate to="/setup" replace />;
  if (loc.pathname === "/login") return data.authed ? <Navigate to="/" replace /> : <LoginPage />;
  if (!data.authed) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HQPage />} />
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="/agent/:id" element={<AgentPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Gate />
    </BrowserRouter>
  );
}
