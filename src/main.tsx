import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { device } from './lib/device';
import './styles/global.css';

const theme = device.get().theme;
if (theme) document.documentElement.dataset.theme = theme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
