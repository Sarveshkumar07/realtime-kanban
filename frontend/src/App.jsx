import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { disconnectSocket } from './socket';
import Login from './components/Login.jsx';
import Workspace from './components/Workspace.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .get('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const logout = () => {
    setToken(null);
    disconnectSocket();
    setUser(null);
  };

  if (!ready) return <div className="splash">Loading…</div>;

  return (
    <>
      {user ? <Workspace user={user} onLogout={logout} toast={toast} /> : <Login onAuth={setUser} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
