import React, { useState } from 'react';
import { login, register, me, logout } from '../services/documentService';
import { useNavigate } from 'react-router-dom';

const AuthPage = () => {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      setStatus('Working...');
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password, email);
      }
      setStatus('Success');
      navigate('/documents');
    } catch (e) {
      setStatus('Failed');
      alert(e.message);
    }
  };

  const checkMe = async () => {
    const data = await me();
    alert(JSON.stringify(data));
  };

  const doLogout = async () => {
    await logout();
    alert('Logged out');
  };

  return (
    <div style={{ padding: 16, maxWidth: 420, margin: '0 auto' }}>
      <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 8 }}>
          <label>Username</label>
          <input value={username} onChange={(e)=>setUsername(e.target.value)} required />
        </div>
        {mode === 'register' && (
          <div style={{ marginBottom: 8 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          </div>
        )}
        <div style={{ marginBottom: 8 }}>
          <label>Password</label>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary">{mode === 'login' ? 'Login' : 'Register'}</button>
        <button type="button" className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={()=>setMode(mode==='login'?'register':'login')}>
          Switch to {mode === 'login' ? 'Register' : 'Login'}
        </button>
      </form>
      <div style={{ marginTop: 12 }}>{status}</div>
      <div style={{ marginTop: 12 }}>
        <button className="btn" onClick={checkMe}>Who am I?</button>
        <button className="btn" style={{ marginLeft: 8 }} onClick={doLogout}>Logout</button>
      </div>
    </div>
  );
};

export default AuthPage;


