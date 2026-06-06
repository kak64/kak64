import { useEffect, useState } from 'react';
import { api, auth } from './api.js';
import { ToastProvider } from './components/Toast.jsx';
import TabBar from './components/TabBar.jsx';
import Auth from './screens/Auth.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Shopping from './screens/Shopping.jsx';
import Tasks from './screens/Tasks.jsx';
import Settings from './screens/Settings.jsx';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [home, setHome] = useState(null);
  const [hasHome, setHasHome] = useState(null); // null=unknown, false=none
  const [tab, setTab] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // boot: restore session + first home
  useEffect(() => {
    (async () => {
      if (!auth.token) { setBooting(false); return; }
      try {
        const { user } = await api('/auth/me');
        setUser(user);
        await loadFirstHome();
      } catch {
        auth.clear();
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFirstHome() {
    const { homes } = await api('/homes');
    if (homes.length) { setHome(homes[0]); setHasHome(true); }
    else { setHome(null); setHasHome(false); }
  }

  const onAuth = async (u) => {
    setUser(u);
    await loadFirstHome();
  };

  const onLogout = () => {
    auth.clear();
    setUser(null); setHome(null); setHasHome(null); setTab('home'); setSettingsOpen(false);
  };

  const onHomeGone = async () => {
    setSettingsOpen(false);
    setTab('home');
    await loadFirstHome();
  };

  if (booting) return <div className="app"><div className="spinner" /></div>;

  if (!user) return <ToastProvider><div className="app"><Auth onAuth={onAuth} /></div></ToastProvider>;

  if (hasHome === false)
    return (
      <ToastProvider>
        <div className="app">
          <Onboarding user={user} onReady={(h) => { setHome(h); setHasHome(true); }} />
        </div>
      </ToastProvider>
    );

  if (!home) return <div className="app"><div className="spinner" /></div>;

  return (
    <ToastProvider>
      <div className="app">
        {settingsOpen ? (
          <Settings
            user={user}
            home={home}
            onClose={() => setSettingsOpen(false)}
            onUser={setUser}
            onLogout={onLogout}
            onHomeGone={onHomeGone}
            onHomeChanged={(h) => setHome((prev) => ({ ...prev, ...h }))}
          />
        ) : (
          <>
            {tab === 'home' && (
              <Home user={user} home={home} onOpenTab={setTab} onOpenSettings={() => setSettingsOpen(true)} onHome={setHome} />
            )}
            {tab === 'shopping' && <Shopping home={home} onBack={() => setTab('home')} />}
            {tab === 'tasks' && <Tasks home={home} onBack={() => setTab('home')} />}
            <TabBar active={tab} onChange={setTab} />
          </>
        )}
      </div>
    </ToastProvider>
  );
}
