import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SubdomainProvider } from './contexts/SubdomainContext.tsx';
import './utils/env';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SubdomainProvider>
      <App />
    </SubdomainProvider>
  </StrictMode>,
);
