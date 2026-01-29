import React, { useEffect, useState, useCallback } from 'react';
import './Snackbar.css';

export interface SnackbarMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let snackbarIdCounter = 0;
let globalAddSnackbar: ((text: string, type: 'success' | 'error' | 'info') => void) | null = null;

export const showSnackbar = (text: string, type: 'success' | 'error' | 'info' = 'info'): void => {
  if (globalAddSnackbar) {
    globalAddSnackbar(text, type);
  }
};

const SnackbarContainer: React.FC = () => {
  const [messages, setMessages] = useState<SnackbarMessage[]>([]);

  const addMessage = useCallback((text: string, type: 'success' | 'error' | 'info') => {
    const id = ++snackbarIdCounter;
    setMessages(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setMessages(prev => prev.filter(m => m.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    globalAddSnackbar = addMessage;
    return () => { globalAddSnackbar = null; };
  }, [addMessage]);

  const dismiss = (id: number): void => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  if (messages.length === 0) return null;

  return (
    <div className="snackbar-container">
      {messages.map(msg => (
        <div key={msg.id} className={`snackbar snackbar-${msg.type}`}>
          <span className="snackbar-icon">
            {msg.type === 'success' && '\u2713'}
            {msg.type === 'error' && '\u2717'}
            {msg.type === 'info' && '\u2139'}
          </span>
          <span className="snackbar-text">{msg.text}</span>
          <button className="snackbar-close" onClick={() => dismiss(msg.id)}>&times;</button>
        </div>
      ))}
    </div>
  );
};

export default SnackbarContainer;
