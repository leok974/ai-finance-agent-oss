import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { Toaster } from "@/components/ui/toaster";
import Providers from "@/components/Providers";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <App />
      <Toaster />
    </Providers>
  </React.StrictMode>
)
