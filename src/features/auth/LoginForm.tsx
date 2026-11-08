import { useState, type FormEvent } from 'react';
import { ui } from '@/components/uiStyles';
import { friendly } from '@/data/backend';
import { useBackend } from '@/data/context';
import { useStageCollapsed } from '@/viewer/stageContext';

export function LoginForm() {
  const backend = useBackend();
  useStageCollapsed();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    try {
      await backend.signIn(email.trim(), password);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Staff</p>
        <h2>Staff sign in</h2>
        <p className={ui.muted}>
          {backend.kind === 'demo'
            ? 'Demo mode: any email and password works, and everything stays in this browser.'
            : 'Use the email and password the gym owner set up for you.'}
        </p>
      </div>
      <form className={ui.field} onSubmit={submit} style={{ gap: 12 }}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="lemail">
            Email
          </label>
          <input
            id="lemail"
            className={ui.input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="lpw">
            Password
          </label>
          <input
            id="lpw"
            className={ui.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className={ui.error}>{error}</p>}
        <button type="submit" className={`${ui.btn} ${ui.primary}`} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}
