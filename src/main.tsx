import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import './styles.css';

// Handy in the browser console: __algodesk.getState()
(window as unknown as { __algodesk: typeof useStore }).__algodesk = useStore;

createRoot(document.getElementById('root')!).render(<App />);
