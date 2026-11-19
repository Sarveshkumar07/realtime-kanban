import { useState } from 'react';
import { api, setToken } from '../api';

export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/auth/${mode}`, form);
      setToken(res.token);
      onAuth(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-card">
        <h1 className="brand-lg">Livewall</h1>
        <p className="muted">One board per branch. Everyone sees changes the moment they happen.</p>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Your name
              <input value={form.name} onChange={set('name')} required autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={set('password')} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={busy}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
        <div className="demo">
          <strong>Demo accounts</strong> (password <code>password123</code>)
          <ul>
            <li>alice@acme.com – org admin of Acme (all branches)</li>
            <li>bob@acme.com – branch admin, Mumbai</li>
            <li>carol@acme.com – member, Mumbai</li>
            <li>dave@acme.com – member, Delhi</li>
            <li>eve@globex.com – admin of a different organization</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
