import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { LanguageProvider, setPlatformLanguage } from "./i18n/index.jsx";
import { GuidanceModeProvider } from "./guidance/guidanceMode.jsx";
import { setStorageBackend } from "./core/storage.js";
import { adoptRawSave } from "./core/persistence.js";
import { initYandexPlatform, loadCloudSave, notifyGameReady } from "./platform/yandex.js";
import "./styles.css";

// Boot order matters: the host platform decides which storage the save lives in
// and which language the player expects, and both are read during the very first
// render (the roster is loaded in a useState initializer). So the platform is
// resolved first — it is time-boxed and never rejects, so an unreachable SDK
// just means the game starts standalone a moment later.
//
// Nothing here may prevent the game from rendering: a platform that misbehaves
// must cost features, never the whole game. Hence the try/catch around the
// handshake and the render call outside it.
async function boot() {
  try {
    const platform = await initYandexPlatform();
    if (platform.storage) setStorageBackend(platform.storage);
    if (platform.language) setPlatformLanguage(platform.language);

    // A cloud save from another device wins only if it is newer than the local one.
    if (platform.available) {
      const cloud = await loadCloudSave();
      if (cloud) adoptRawSave(cloud);
    }
  } catch {
    // Fall through and start the game standalone.
  }

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <LanguageProvider>
        <GuidanceModeProvider>
          <App />
        </GuidanceModeProvider>
      </LanguageProvider>
    </React.StrictMode>,
  );

  // The platform hides its own loader on this call, so it fires only once the
  // first playable frame has actually been painted. If the SDK is still loading,
  // the request is remembered and sent the moment it is ready.
  requestAnimationFrame(() => requestAnimationFrame(notifyGameReady));
}

boot();
