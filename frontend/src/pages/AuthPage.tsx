import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { login, register, me, logout, verifyEmail, resendVerificationCode } from '../services/documentService';
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

  // Verification state
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setStatus('Working...');
      if (mode === 'login') {
        const data = await login(username, password);
        setStatus('Success');
        const approvalStatus = (data as { approval_status?: string }).approval_status;
        if (approvalStatus === 'pending_verification') {
          setShowVerification(true);
        } else if (approvalStatus === 'pending_approval') {
          setPendingApproval(true);
        } else if (approvalStatus === 'rejected') {
          showSnackbar('Your account has been rejected.', 'error');
        } else {
          navigate('/documents');
        }
      } else {
        const data = await register(username, password, email);
        setStatus('Success');
        if ((data as { needs_verification?: boolean }).needs_verification) {
          setShowVerification(true);
          showSnackbar('Account created! Please check your email for a verification code.', 'success');
        } else {
          navigate('/documents');
        }
      }
    } catch (err) {
      setStatus('Failed');
      showSnackbar((err as Error).message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onVerify = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const result = await verifyEmail(verificationCode);
      showSnackbar('Email verified successfully!', 'success');
      if (result.approval_status === 'pending_approval') {
        setPendingApproval(true);
        setShowVerification(false);
      } else {
        navigate('/documents');
      }
    } catch (err) {
      showSnackbar((err as Error).message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async (): Promise<void> => {
    try {
      await resendVerificationCode();
      showSnackbar('Verification code resent! Check your email.', 'success');
    } catch (err) {
      showSnackbar((err as Error).message, 'error');
    }
  };

  const checkMe = async (): Promise<void> => {
    const data = await me();
    showSnackbar(`Logged in as: ${data?.username || 'unknown'}`, 'info');
  };

  const doLogout = async (): Promise<void> => {
    await logout();
    setShowVerification(false);
    setPendingApproval(false);
    showSnackbar('Logged out successfully', 'success');
  };

  const statusClass = status === 'Working...' ? 'working' : status === 'Success' ? 'success' : status === 'Failed' ? 'failed' : '';

  if (pendingApproval) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>Account Pending Approval</h2>
            <p>Your email has been verified</p>
          </div>
          <div className="auth-form">
            <div className="auth-pending-message">
              <div className="auth-pending-icon">&#9203;</div>
              <p>Your account is pending admin approval. You will be notified once your account has been approved.</p>
              <p className="auth-pending-hint">You can close this page and come back later.</p>
            </div>
          </div>
          <hr className="auth-divider" />
          <div className="auth-diagnostics">
            <button type="button" className="auth-diag-btn" onClick={doLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showVerification) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>Verify Your Email</h2>
            <p>Enter the 6-digit code sent to your email</p>
          </div>
          <form className="auth-form" onSubmit={onVerify}>
            <div className="auth-input-group">
              <label htmlFor="verification-code">Verification Code</label>
              <input
                id="verification-code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                maxLength={6}
                required
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '8px' }}
              />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={isSubmitting || verificationCode.length !== 6}>
              {isSubmitting ? (
                <>
                  <span className="auth-spinner"></span>
                  Verifying...
                </>
              ) : (
                'Verify Email'
              )}
            </button>
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button type="button" className="auth-diag-btn" onClick={onResend}>
                Resend Code
              </button>
            </div>
          </form>
          <hr className="auth-divider" />
          <div className="auth-diagnostics">
            <button type="button" className="auth-diag-btn" onClick={doLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                required
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
              {status === 'Success' && 'Authentication successful!'}
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
