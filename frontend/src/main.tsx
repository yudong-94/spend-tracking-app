import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import App from "./App.tsx";
import './index.css';
import { DataCacheProvider } from "@/state/data-cache";
import { AuthProvider } from "./state/auth";
import AccessGate from "./components/AccessGate";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DataCacheProvider>
          <AuthProvider>
            <AccessGate>
              <App />
            </AccessGate>
          </AuthProvider>
        </DataCacheProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
