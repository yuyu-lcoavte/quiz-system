import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';

function SetupShell() {
  return (
    <BrowserRouter>
      <main className="min-h-screen p-8">
        <h1 className="text-2xl font-semibold">課堂搶答系統</h1>
        <p className="mt-2">Shared Foundation workspace is ready.</p>
      </main>
    </BrowserRouter>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <SetupShell />
  </StrictMode>,
);
