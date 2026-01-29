import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { login, register, me, logout } from '../services/documentService';
import { useNavigate } from 'react-router-dom';
import { showSnackbar } from '../components/Snackbar';
import './AuthPage.css';

const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setStatus('Working...');
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password, email);
      }
      setStatus('Success');
      navigate('/documents');
    } catch (err) {
      setStatus('Failed');
      showSnackbar((err as Error).message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkMe = async (): Promise<void> => {
    const data = await me();
    showSnackbar(`Logged in as: ${data?.username || 'unknown'}`, 'info');
  };

  const doLogout = async (): Promise<void> => {
    await logout();
    showSnackbar('Logged out successfully', 'success');
  };

  const statusClass = status === 'Working...' ? 'working' : status === 'Success' ? 'success' : status === 'Failed' ? 'failed' : '';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card-header">
          <h2>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
          <p>{mode === 'login' ? 'Sign in to access your documents' : 'Register to start managing documents'}</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
            type="button"
          >
            Login
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
            type="button"
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-input-group">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </div>

          {mode === 'register' && (
            <div className="auth-input-group">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
              />
            </div>
          )}

          <div className="auth-input-group">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="auth-spinner"></span>
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              mode === 'login' ? 'Sign In' : 'Create Account'
            )}
          </button>

          {status && (
            <div className={`auth-status ${statusClass}`}>
              {status === 'Working...' && 'Authenticating...'}
              {status === 'Success' && 'Authentication successful! Redirecting...'}
              {status === 'Failed' && 'Authentication failed. Please try again.'}
            </div>
          )}
        </form>

        <hr className="auth-divider" />

        <div className="auth-diagnostics">
          <button type="button" className="auth-diag-btn" onClick={checkMe}>
            Who am I?
          </button>
          <button type="button" className="auth-diag-btn" onClick={doLogout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
