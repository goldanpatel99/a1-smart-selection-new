// Clean any corrupted or bloated firestore mutation keys from browser localStorage
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('firestore_mutations_')) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  }
} catch {}

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

