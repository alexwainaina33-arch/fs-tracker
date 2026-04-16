import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20000, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#181c21",
              color: "#c2cad4",
              border: "1px solid #21272f",
              borderRadius: "12px",
              fontFamily: "Outfit, sans-serif",
              fontSize: "14px",
            },
            success: { iconTheme: { primary: "#c8f230", secondary: "#0a0d0f" } },
            error:   { iconTheme: { primary: "#ff4d4f", secondary: "#0a0d0f" } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
