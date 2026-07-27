import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import StoreProvider from './lib/public/StoreProvider';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider } from './hooks/theme-provider';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <StoreProvider>
        <BrowserRouter>
          <App />
          <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
        </BrowserRouter>
      </StoreProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
