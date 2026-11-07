import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Input from '@/components/input/input-container';
import Analysis from '@/components/analysis/analysis-page';
import '@/app/globals.css';
function App() {
  const [path, setPath] = useState(location.hash);
  useEffect(() => { const change = () => setPath(location.hash); addEventListener('hashchange', change); return () => removeEventListener('hashchange', change); }, []);
  return path.includes('/analysis') ? <Analysis /> : <main><h1 className="px-6 text-2xl">Counselor intake</h1><Input /></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
