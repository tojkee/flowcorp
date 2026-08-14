import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { LanguageProvider } from "./i18n/index.jsx";
import { GuidanceModeProvider } from "./guidance/guidanceMode.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <GuidanceModeProvider>
        <App />
      </GuidanceModeProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
