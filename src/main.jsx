import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import OptoKVA from './OptoKVA.jsx';
import './index.css';

// SHA-256 hash of the passphrase "OptoKVA2026".
// Generated via: crypto.subtle.digest('SHA-256', new TextEncoder().encode('OptoKVA2026'))
const PASSPHRASE_HASH = '507495716c470293e8f366d02233bdd6485a1b79b7395433e1249b03d2f7768c';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeSessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSessionSet(key, val) {
  try { sessionStorage.setItem(key, val); } catch { /* ignore */ }
}

function PassphraseGate({ children }) {
  const [authed, setAuthed] = useState(() => safeSessionGet('optokva_auth') === 'yes');
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setChecking(true);
    setError(false);
    const hash = await sha256(input.trim());
    if (hash === PASSPHRASE_HASH) {
      safeSessionSet('optokva_auth', 'yes');
      setAuthed(true);
    } else {
      setError(true);
    }
    setChecking(false);
  }, [input]);

  if (authed) return children;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-1">OptoKVA</h1>
          <p className="text-sm text-slate-500">Clinical visual acuity & contrast sensitivity instrument</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-300 p-6 shadow-sm">
          <label className="block text-sm text-slate-700 mb-2 font-medium">
            Enter passphrase to continue
          </label>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="Passphrase"
            autoFocus
            className={`w-full border rounded px-3 py-2 text-sm mb-3 ${
              error ? 'border-rose-500 bg-rose-50' : 'border-slate-300'
            }`}
          />
          {error && (
            <p className="text-xs text-rose-600 mb-3">Incorrect passphrase. Please try again.</p>
          )}
          <button
            type="submit"
            disabled={checking || !input.trim()}
            className={`w-full py-2 rounded font-semibold text-white text-sm ${
              checking || !input.trim() ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-900'
            }`}
          >
            {checking ? 'Checking...' : 'Enter'}
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-6">
          Access restricted to authorised collaborators.
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PassphraseGate>
      <OptoKVA />
    </PassphraseGate>
  </React.StrictMode>
);
