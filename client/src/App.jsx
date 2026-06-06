import { useEffect, useState } from 'react';
import { api, auth } from './api.js';
import { ToastProvider } from './components/Toast.jsx';
import TabBar from './components/TabBar.jsx';
import Auth from './screens/Auth.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Lists from './screens/Lists.jsx';
import ListDetail from './screens/ListDetail.jsx';
import Settings from './screens/Settings.jsx';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [space, setSpace] = useState(null);
  const [hasSpace, setHasSpace] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [openListId, setOpenListId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      if (!auth.token) { setBooting(false); return; }
      try {
        const { user } = await api('/auth/me');
        setUser(user);
        await loadFirstSpace();
      } catch { auth.clear(); } finally { setBooting(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFirstSpace() {
    const { spaces } = await api('/spaces');
    if (spaces.length) { setSpace(spaces[0]); setHasSpace(true); }
    else { setSpace(null); setHasSpace(false); }
  }

  const onAuth = async (u) => { setUser(u); await loadFirstSpace(); };
  const onLogout = () => {
    auth.clear();
    setUser(null); setSpace(null); setHasSpace(null); setTab('dashboard'); setOpenListId(null); setSettingsOpen(false);
  };
  const onSpaceGone = async () => {
    setSettingsOpen(false); setOpenListId(null); setTab('dashboard');
    await loadFirstSpace();
  };
  const openList = (id) => { setOpenListId(id); };

  if (booting) return <div className="app"><div className="spinner" /></div>;
  if (!user) return <ToastProvider><div className="app"><Auth onAuth={onAuth} /></div></ToastProvider>;
  if (hasSpace === false)
    return <ToastProvider><div className="app"><Onboarding user={user} onReady={(sp) => { setSpace(sp); setHasSpace(true); }} /></div></ToastProvider>;
  if (!space) return <div className="app"><div className="spinner" /></div>;

  return (
    <ToastProvider>
      <div className="app">
        {settingsOpen ? (
          <Settings
            user={user} space={space}
            onClose={() => setSettingsOpen(false)}
            onUser={setUser} onLogout={onLogout}
            onSpaceGone={onSpaceGone}
            onSpaceChanged={(sp) => setSpace((p) => ({ ...p, ...sp }))}
          />
        ) : openListId ? (
          <ListDetail space={space} listId={openListId} onBack={() => setOpenListId(null)} />
        ) : (
          <>
            {tab === 'dashboard' && (
              <Dashboard
                user={user} space={space}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenList={openList}
                onOpenLists={() => setTab('lists')}
                onSpace={setSpace}
              />
            )}
            {tab === 'lists' && <Lists space={space} onOpenList={openList} />}
            <TabBar active={tab} onChange={(t) => { setOpenListId(null); setTab(t); }} />
          </>
        )}
      </div>
    </ToastProvider>
  );
}
