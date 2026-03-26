
# Plan de Modularización: Chrome Extension con Vite

## 1. Resumen Ejecutivo

Migrar la extensión Chrome "Analista Web AI Pro" de archivos JavaScript monolíticos a una arquitectura modular usando **Vite** como bundler. El proyecto tiene 3 entry points principales (`background`, `content`, `sidepanel`) y 2 módulos compartidos (`debug_logger`, `journey_runtime`).

---

## 2. Estructura Actual vs. Estructura Objetivo

### Actual (plana, monolítica)
```
infoclusiv-clusiv-automation-web/
├── background.js          (~450 líneas)
├── content.js             (~800 líneas)
├── debug_logger.js        (~70 líneas)
├── journey_runtime.js     (~350 líneas)
├── manifest.json
├── sidepanel.html
└── sidepanel.js           (~900 líneas)
```

### Objetivo (modular con Vite)
```
infoclusiv-clusiv-automation-web/
├── public/
│   └── manifest.json                  # Se copia tal cual al build
├── src/
│   ├── background/
│   │   ├── index.js                   # Entry point — inicialización y listeners
│   │   ├── constants.js               # WS_URL, CHATGPT_TAB_PATTERNS, KEEPALIVE_ALARM_NAME
│   │   ├── state.js                   # backendConnectionState, preferredChatGptTabId, externalVariablesCache
│   │   ├── ws-control.js              # connectWebSocket, sendControlMessage, onMessage handler
│   │   ├── ws-template.js             # connectTemplateWebSocket, persistExternalVariables
│   │   ├── tab-manager.js             # prepareChatGptTab, resolveTargetTab, waitForTabComplete, findTargetTabByPatterns
│   │   ├── journey-executor.js        # executeJourney, getExecutionPreparation, validateJourneyExecution
│   │   ├── python-bridge.js           # sendStatusToPython, sendJourneysToPython, sendValidationResultToPython
│   │   └── message-handler.js         # chrome.runtime.onMessage listener (sidepanel → background)
│   │
│   ├── content/
│   │   ├── index.js                   # Entry point — registra listeners y arranca observers
│   │   ├── constants.js               # INTERACTIVE_QUERY, EDITABLE_QUERY
│   │   ├── dom/
│   │   │   ├── queries.js             # collectRoots, querySelectorDeep, collectDeepInteractiveElements
│   │   │   ├── visibility.js          # isVisibleElement, isEditableElement, findEditableCandidate
│   │   │   ├── selectors.js           # generateBestSelector, buildStableLocator, cssEscape
│   │   │   ├── locators.js            # findElementByLocator, findElementByText, findTargetElement, scoreCandidate
│   │   │   └── semantic-map.js        # getSemanticMap, identifyContext
│   │   ├── interactions/
│   │   │   ├── click.js               # simulateHumanClick, clickWithRetries
│   │   │   ├── paste.js               # insertTextIntoElement, pasteTextWithRetries, helpers de texto
│   │   │   └── keyboard.js            # simulateKeyPress
│   │   ├── audio/
│   │   │   ├── observer.js            # startAudioObserver, handleNewAudioElement
│   │   │   ├── controls.js            # control play/pause/stop, get_info, wait_end
│   │   │   └── download.js            # downloadAudioFromPage, waitForAudioElement, GET_AUDIO_SRC
│   │   ├── recording.js               # isRecordingMode, listener de clicks para grabación
│   │   ├── auto-scan.js               # autoScanActive, startObserver, stopObserver, autoAnalyzeAndSync
│   │   ├── validation.js              # validateExecutionStep
│   │   └── message-handler.js         # chrome.runtime.onMessage router principal
│   │
│   ├── sidepanel/
│   │   ├── index.js                   # Entry point — inicializa todo, registra event listeners globales
│   │   ├── state.js                   # Variables de estado: lastAnalysisData, chatHistory, isRecording, etc.
│   │   ├── dom-refs.js                # Referencias a todos los elementos del DOM (getElementById)
│   │   ├── config.js                  # Lógica del panel de configuración (API key, modelo)
│   │   ├── tabs.js                    # switchTab
│   │   ├── backend-status.js          # renderBackendStatus
│   │   ├── scan.js                    # Escaneo manual, auto-scan, renderMap
│   │   ├── chat.js                    # handleSendMessage, callOpenRouter, addUserMessage, addAiMessage
│   │   ├── search.js                  # Filtrado en searchInput
│   │   ├── recording/
│   │   │   ├── controls.js            # startRecording, stopRecording, updateRecStepCount
│   │   │   ├── text-picker.js         # showTextPicker, btnAddTextStep
│   │   │   ├── key-picker.js          # KEY_GROUPS, showKeyPicker
│   │   │   └── wait-step.js           # btnAddWaitStep handler
│   │   ├── journeys/
│   │   │   ├── persistence.js         # loadJourneys, saveJourneys, sendJourneysToPython
│   │   │   ├── render.js              # renderJourneys, renameJourney
│   │   │   ├── playback.js            # playJourney, btnStopPlayback
│   │   │   └── export.js              # exportJourneyAsFile, buildExportPayload, buildExportLocators
│   │   ├── texts/
│   │   │   ├── persistence.js         # loadTexts, saveTexts
│   │   │   └── render.js              # renderTexts, editor handlers
│   │   ├── external-variables.js      # loadExternalVariables, listeners de cambios
│   │   └── audio-banner.js            # showAudioBanner, refreshMapWithAudio, bannerBtnStyle
│   │
│   └── shared/
│       ├── debug-logger.js            # ClusivLogger (export named)
│       └── journey-runtime.js         # ClusivJourneyRuntime (export named de cada función)
│
├── sidepanel.html                     # Actualizado para cargar el bundle de Vite
├── vite.config.js
├── package.json
└── .gitignore
```

---

## 3. Fases de Ejecución

### FASE 0: Inicialización del Proyecto Node/Vite

**Archivos a crear:**

#### 3.0.1 `package.json`
```json
{
  "name": "clusiv-automation-web",
  "private": true,
  "version": "4.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch --mode development",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^6.3.0"
  }
}
```

#### 3.0.2 `vite.config.js`
```js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // No minificar en dev para facilitar debug en chrome://extensions
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV !== 'production' ? 'inline' : false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.js'),
        content: resolve(__dirname, 'src/content/index.js'),
        sidepanel: resolve(__dirname, 'src/sidepanel/index.js'),
      },
      output: {
        // Cada entry point genera UN solo archivo (critical para extensiones Chrome)
        entryFileNames: '[name].js',
        // No generar chunks compartidos — cada bundle es self-contained
        manualChunks: undefined,
        // Formato IIFE para compatibilidad con service workers y content scripts
        format: 'iife',
        // Deshabilitar code splitting
        inlineDynamicImports: false,
      },
    },
  },
  // Copiar archivos estáticos (manifest.json) a dist/
  publicDir: 'public',
});
```

> **NOTA IMPORTANTE sobre el output format:** Chrome MV3 service workers **no soportan** ES modules en `format: 'es'` sin `"type": "module"` en el manifest. Usar `format: 'iife'` con 3 builds separados. Si `rollupOptions` con múltiples inputs y `format: 'iife'` genera conflictos, cambiar a **3 builds secuenciales** en el config:

**Alternativa robusta para `vite.config.js`** (3 builds):
```js
import { defineConfig } from 'vite';
import { resolve } from 'path';

const entries = ['background', 'content', 'sidepanel'];

export default defineConfig(({ mode }) => {
  // Vite no soporta nativamente IIFE con múltiples inputs.
  // Usamos un solo input por build o configuramos manualChunks.
  // Solución: generar 3 configuraciones y usar un script build.
  
  const target = process.env.BUILD_TARGET || 'all';
  
  if (target === 'all') {
    // Build único con format 'es' — funciona si el manifest usa "type": "module"
    return {
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        minify: mode === 'production',
        sourcemap: mode !== 'production' ? 'inline' : false,
        rollupOptions: {
          input: {
            background: resolve(__dirname, 'src/background/index.js'),
            content: resolve(__dirname, 'src/content/index.js'),
            sidepanel: resolve(__dirname, 'src/sidepanel/index.js'),
          },
          output: {
            entryFileNames: '[name].js',
            chunkFileNames: 'chunks/[name]-[hash].js',
            format: 'es',
          },
        },
      },
      publicDir: 'public',
    };
  }
});
```

#### 3.0.3 `.gitignore`
```
node_modules/
dist/
*.log
```

#### 3.0.4 `public/manifest.json`
```json
{
  "manifest_version": 3,
  "name": "Analista Web AI Pro",
  "version": "4.1",
  "description": "Analiza el DOM y chatea con la estructura usando OpenRouter.",
  "permissions": ["sidePanel", "scripting", "activeTab", "storage", "tabs", "alarms"],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_title": "Abrir Analista"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "all_frames": true,
      "match_about_blank": true
    }
  ]
}
```

> **Cambio clave:** se agrega `"type": "module"` al background service worker para que Vite pueda generar módulos ES.

#### 3.0.5 `sidepanel.html` (actualizado)
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <!-- Los estilos se extraerán del CSS embebido actual y se pondrán en un archivo aparte más adelante. -->
    <!-- Por ahora, copiar el <style> existente aquí SIN cambios -->
    <style>
      /* ... todos los estilos CSS actuales sin cambios ... */
    </style>
</head>
<body>
    <!-- ... todo el HTML body actual sin cambios ... -->

    <!-- CAMBIO: reemplazar los 3 scripts por el bundle de Vite -->
    <script type="module" src="./sidepanel.js"></script>
</body>
</html>
```

> **Se eliminan** las líneas `<script src="debug_logger.js">`, `<script src="journey_runtime.js">`, `<script src="sidepanel.js">` y se reemplazan por un solo import del bundle.

**Comandos a ejecutar:**
```bash
cd infoclusiv-clusiv-automation-web
npm init -y   # o crear package.json manualmente
npm install --save-dev vite
mkdir -p src/background src/content/dom src/content/interactions src/content/audio src/sidepanel/recording src/sidepanel/journeys src/sidepanel/texts src/shared public
```

---

### FASE 1: Migrar Módulos Compartidos

Estos módulos son usados tanto por `background` como por `sidepanel`. Deben exportar funciones/objetos con `export`.

#### 3.1.1 `src/shared/debug-logger.js`

**Origen:** `debug_logger.js` completo.

**Cambios requeridos:**
1. Eliminar el patrón IIFE `(() => { ... })()` — usar `export` directo
2. Eliminar `globalThis.ClusivLogger = ClusivLogger;`
3. Exportar con `export const ClusivLogger = { ... };`

**Contenido transformado (pseudocódigo de la transformación):**
```js
// ANTES:
// const ClusivLogger = (() => { ... })();
// globalThis.ClusivLogger = ClusivLogger;

// DESPUÉS:
const MAX_BUFFER = 500;
const SESSION_KEY = 'clusiv_debug_log';
let sessionId = Math.random().toString(36).slice(2, 10);
let buffer = [];

// ... (toda la lógica interna idéntica) ...

export const ClusivLogger = {
  debug: (event, data) => write('DEBUG', event, data),
  info: (event, data) => write('INFO', event, data),
  warning: (event, data) => write('WARNING', event, data),
  error: (event, data) => write('ERROR', event, data),
  journey: (event, data) => write('JOURNEY', event, data),
  export: () => JSON.stringify(buffer, null, 2),
  getBuffer: () => [...buffer],
  clear: () => { buffer = []; chrome.storage.session.remove(SESSION_KEY); },
  getSessionId: () => sessionId
};
```

#### 3.1.2 `src/shared/journey-runtime.js`

**Origen:** `journey_runtime.js` completo.

**Cambios requeridos:**
1. Eliminar el patrón IIFE `(function (root) { ... })(typeof self !== 'undefined' ? self : window);`
2. Eliminar `root.ClusivJourneyRuntime = { ... };`
3. Exportar cada función individualmente con `export function` Y también exportar el objeto agrupado

**Contenido transformado:**
```js
// ANTES:
// (function (root) { ... root.ClusivJourneyRuntime = { ... }; })(typeof self !== 'undefined' ? self : window);

// DESPUÉS:
const PLACEHOLDER_REGEX = /\[([A-Z0-9_]+)\]/g;

// ... (todas las funciones internas sin cambios en lógica) ...

export function buildTextIndex(savedTexts) { /* ... */ }
export function extractTemplateVariables(content) { /* ... */ }
export function resolveTemplateVariables(content, externalVariables) { /* ... */ }
export function buildJourneyExecutionPlan(options) { /* ... */ }
export function getStepDisplayLabel(step, fallback = 'Paso') { /* ... */ }
export function summarizeBlockingIssues(issues) { /* ... */ }
export function executeJourneyPlan(options) { /* ... */ }

// También exportar como objeto agrupado para backward-compat
export const ClusivJourneyRuntime = {
  buildTextIndex,
  extractTemplateVariables,
  resolveTemplateVariables,
  buildJourneyExecutionPlan,
  getStepDisplayLabel,
  summarizeBlockingIssues,
  executeJourneyPlan
};
```

---

### FASE 2: Modularizar `background.js`

El `background.js` actual es un archivo monolítico de ~450 líneas. Se divide en 8 módulos.

#### 3.2.1 `src/background/constants.js`

**Extraer de `background.js`:**
```js
export const CHATGPT_TAB_PATTERNS = ['https://chatgpt.com/*', 'https://chat.openai.com/*'];
export const CHATGPT_HOME_URL = 'https://chatgpt.com/';
export const KEEPALIVE_ALARM_NAME = 'keepAlive';
export const WS_URL = 'ws://localhost:8765';
export const TEMPLATE_WS_URL = 'ws://localhost:8766';
```

#### 3.2.2 `src/background/state.js`

**Extraer de `background.js`:** todo el estado mutable del módulo.
```js
// Estado de conexiones WebSocket
export const backendConnectionState = {
  controlConnected: false,
  templateConnected: false,
  controlReadyState: WebSocket.CLOSED,
  templateReadyState: WebSocket.CLOSED
};

export let ws = null;
export let isConnecting = false;
export let templateWs = null;
export let isTemplateConnecting = false;
export let externalVariablesCache = {};
export let preferredChatGptTabId = null;

// Funciones setter (necesarias porque ES modules exportan bindings de solo lectura para let)
export function setWs(value) { ws = value; }
export function setIsConnecting(value) { isConnecting = value; }
export function setTemplateWs(value) { templateWs = value; }
export function setIsTemplateConnecting(value) { isTemplateConnecting = value; }
export function setExternalVariablesCache(value) { externalVariablesCache = value; }
export function setPreferredChatGptTabId(value) { preferredChatGptTabId = value; }

// Funciones helper que operan sobre el estado
export function updateBackendConnectionState(partialState) {
  Object.assign(backendConnectionState, partialState);
}

export function getBackendStatus() {
  return {
    ...backendConnectionState,
    isConnecting,
    isTemplateConnecting
  };
}

// Inicialización desde storage
export function initStateFromStorage() {
  chrome.storage.session.get(['preferredChatGptTabId'], (res) => {
    if (typeof res.preferredChatGptTabId === 'number') {
      preferredChatGptTabId = res.preferredChatGptTabId;
    }
  });
  chrome.storage.local.get(['externalVariables'], (res) => {
    externalVariablesCache = res.externalVariables || {};
  });
}

export function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}
```

#### 3.2.3 `src/background/ws-control.js`

**Extraer de `background.js`:** funciones `connectWebSocket`, `sendControlMessage`, y el handler `ws.onmessage`.

**Imports necesarios:**
```js
import { ClusivLogger } from '../shared/debug-logger.js';
import { WS_URL, CHATGPT_TAB_PATTERNS } from './constants.js';
import * as state from './state.js';
import { sendJourneysToPython, sendStatusToPython, sendValidationResultToPython } from './python-bridge.js';
import { prepareChatGptTab } from './tab-manager.js';
import { executeJourney } from './journey-executor.js';
```

**Funciones exportadas:**
- `export function connectWebSocket()`
- `export function sendControlMessage(payload)`
- `function notifyBackendStatusUpdated()` (puede ser interna o exportada)
- `function notifyExternalVariablesUpdated()` (puede ser interna o exportada)

**Notas:** El `ws.onmessage` handler contiene toda la lógica de dispatch de mensajes del backend Python. Se mantiene en este módulo por cohesión con la conexión WebSocket.

#### 3.2.4 `src/background/ws-template.js`

**Extraer de `background.js`:** funciones `connectTemplateWebSocket`, `persistExternalVariables`, `sendTemplateSyncAck`.

**Imports necesarios:**
```js
import { ClusivLogger } from '../shared/debug-logger.js';
import { TEMPLATE_WS_URL } from './constants.js';
import * as state from './state.js';
```

**Funciones exportadas:**
- `export function connectTemplateWebSocket()`
- `export function persistExternalVariables(incomingVariables, metadata, updatedAt, requestId)`
- `export function sendTemplateSyncAck(updatedAt, variableNames, requestId)`

#### 3.2.5 `src/background/tab-manager.js`

**Extraer de `background.js`:** todas las funciones de gestión de pestañas.

**Funciones exportadas:**
- `export function delay(ms)`
- `export async function waitForTabComplete(tabId, timeoutMs)`
- `export async function findTargetTabByPatterns(patterns, timeoutMs)`
- `export async function getPreferredChatGptTab(patterns)`
- `export async function prepareChatGptTab(tabUrlPatterns, requestId)`
- `export async function resolveTargetTab(tabUrlPatterns)`
- `export function setPreferredChatGptTabId(tabId)` (wrapper que actualiza state + storage)

#### 3.2.6 `src/background/journey-executor.js`

**Extraer de `background.js`:** `executeJourney`, `getExecutionPreparation`, `validateJourneyExecution`, `summarizeValidationIssues`.

**Imports necesarios:**
```js
import { ClusivLogger } from '../shared/debug-logger.js';
import { ClusivJourneyRuntime } from '../shared/journey-runtime.js';
import * as state from './state.js';
import { sendStatusToPython } from './python-bridge.js';
import { resolveTargetTab } from './tab-manager.js';
import { CHATGPT_TAB_PATTERNS } from './constants.js';
```

#### 3.2.7 `src/background/python-bridge.js`

**Extraer de `background.js`:** funciones de comunicación con Python.

**Funciones exportadas:**
- `export function sendStatusToPython(statusType, messageStr, journeyId, executionId)`
- `export function sendJourneysToPython(requestId)`
- `export async function sendValidationResultToPython(journeyId, options)`

#### 3.2.8 `src/background/message-handler.js`

**Extraer de `background.js`:** el listener `chrome.runtime.onMessage.addListener(...)` que maneja mensajes del sidepanel.

**Funciones exportadas:**
- `export function registerMessageHandlers()`

**Mensajes manejados:**
- `GET_ACTIVE_TAB_CONTEXT`
- `GET_EXTERNAL_VARIABLES`
- `GET_BACKEND_STATUS`
- `GET_DEBUG_LOGS`

#### 3.2.9 `src/background/index.js` (Entry Point)

**Responsabilidades:**
1. Configurar side panel behavior
2. Llamar `initStateFromStorage()`
3. Registrar `chrome.runtime.onInstalled`, `onStartup`
4. Crear alarm keepalive
5. Registrar `chrome.alarms.onAlarm` listener
6. Llamar `connectWebSocket()` y `connectTemplateWebSocket()`
7. Llamar `registerMessageHandlers()`

```js
import { ClusivLogger } from '../shared/debug-logger.js';
import { initStateFromStorage } from './state.js';
import { connectWebSocket } from './ws-control.js';
import { connectTemplateWebSocket } from './ws-template.js';
import { registerMessageHandlers } from './message-handler.js';
import { KEEPALIVE_ALARM_NAME } from './constants.js';
import * as state from './state.js';

// Configuración del side panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Inicializar estado desde storage
initStateFromStorage();

// Registrar handlers de mensajes internos
registerMessageHandlers();

// Lifecycle listeners
chrome.runtime.onInstalled.addListener(() => {
  connectWebSocket();
  connectTemplateWebSocket();
});

chrome.runtime.onStartup.addListener(() => {
  connectWebSocket();
  connectTemplateWebSocket();
});

// Keep-alive alarm
chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: 0.4 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM_NAME) return;
  if (!state.ws || state.ws.readyState === WebSocket.CLOSED) {
    connectWebSocket();
  }
  if (!state.templateWs || state.templateWs.readyState === WebSocket.CLOSED) {
    connectTemplateWebSocket();
  }
});

// Conexión inmediata
connectWebSocket();
connectTemplateWebSocket();
```

---

### FASE 3: Modularizar `content.js`

El `content.js` tiene ~800 líneas. Se divide en módulos por dominio.

#### 3.3.1 `src/content/constants.js`

**Extraer:** `INTERACTIVE_QUERY`, `EDITABLE_QUERY`.

```js
export const INTERACTIVE_QUERY = [
  "button", "a", "input", "select", "textarea", "option",
  // ... (lista completa sin cambios)
].join(", ");

export const EDITABLE_QUERY = [
  "textarea",
  // ... (lista completa sin cambios)
].join(", ");
```

#### 3.3.2 `src/content/dom/queries.js`

**Extraer:** `collectRoots`, `querySelectorDeep`, `collectDeepInteractiveElements`, `getDeepActiveElement`, `normalizeText`, `getElementText`, `cssEscape`.

**Imports:** `INTERACTIVE_QUERY` de `../constants.js`.

#### 3.3.3 `src/content/dom/visibility.js`

**Extraer:** `isVisibleElement`, `isEditableElement`, `findEditableCandidate`, `getEditableText`.

**Imports:** `EDITABLE_QUERY` de `../constants.js`, `getDeepActiveElement` de `./queries.js`.

**Estado compartido:** `lastFocusedEditable` — exportar como variable mutable con setter.

```js
export let lastFocusedEditable = null;
export function setLastFocusedEditable(el) { lastFocusedEditable = el; }
```

#### 3.3.4 `src/content/dom/selectors.js`

**Extraer:** `generateBestSelector`, `buildStableLocator`.

**Imports:** `getElementText` de `./queries.js`.

#### 3.3.5 `src/content/dom/locators.js`

**Extraer:** `scoreCandidate`, `findElementByLocator`, `findElementByText`, `findTargetElement`.

**Imports:** funciones de `./queries.js`, `./visibility.js`, `./selectors.js`.

#### 3.3.6 `src/content/dom/semantic-map.js`

**Extraer:** `getSemanticMap`, `identifyContext`.

**Imports:** funciones de `./queries.js`, `./visibility.js`, `./selectors.js`.

#### 3.3.7 `src/content/interactions/click.js`

**Extraer:** `simulateHumanClick`, `clickWithRetries`.

**Imports:** `findTargetElement` de `../dom/locators.js`.

#### 3.3.8 `src/content/interactions/paste.js`

**Extraer:** `insertTextIntoElement`, `pasteTextWithRetries`, `isComplexRichTextEditor`, `didTextInsertionSucceed`, `countTextOccurrences`, `wait`.

**Imports:** `findEditableCandidate`, `getEditableText`, `isEditableElement` de `../dom/visibility.js`.

#### 3.3.9 `src/content/interactions/keyboard.js`

**Extraer:** `simulateKeyPress`.

**Imports:** `getDeepActiveElement`, `isEditableElement` de sus respectivos módulos.

#### 3.3.10 `src/content/audio/observer.js`

**Extraer:** `startAudioObserver`, `handleNewAudioElement`.

#### 3.3.11 `src/content/audio/controls.js`

**Extraer:** la lógica de `CONTROL_AUDIO` handler (play/pause/stop/get_info/wait_end).

#### 3.3.12 `src/content/audio/download.js`

**Extraer:** `downloadAudioFromPage`, `waitForAudioElement`, lógica de `GET_AUDIO_SRC`.

#### 3.3.13 `src/content/recording.js`

**Extraer:** estado `isRecordingMode`, el listener de click para grabación, el listener de focusin.

```js
export let isRecordingMode = false;
export function setRecordingMode(value) { isRecordingMode = value; }
```

#### 3.3.14 `src/content/auto-scan.js`

**Extraer:** `autoScanActive`, `startObserver`, `stopObserver`, `autoAnalyzeAndSync` (el debounce).

#### 3.3.15 `src/content/validation.js`

**Extraer:** `validateExecutionStep`.

#### 3.3.16 `src/content/message-handler.js`

**Extraer:** el `chrome.runtime.onMessage.addListener(...)` completo, refactorizado para importar las funciones de cada módulo.

```js
import { getSemanticMap } from './dom/semantic-map.js';
import { clickWithRetries, simulateHumanClick } from './interactions/click.js';
import { pasteTextWithRetries } from './interactions/paste.js';
import { simulateKeyPress } from './interactions/keyboard.js';
import { setRecordingMode } from './recording.js';
import { startAutoScan, stopAutoScan } from './auto-scan.js';
import { validateExecutionStep } from './validation.js';
import { handleAudioControl } from './audio/controls.js';
import { downloadAudioFromPage, waitForAudioElement } from './audio/download.js';

export function registerContentMessageHandlers() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Router basado en request.action
    switch (request.action) {
      case 'ANALYZE_DOM': { /* ... */ break; }
      case 'START_AUTO_SCAN': { /* ... */ break; }
      // ... etc
    }
    return true; // mantener canal abierto para respuestas async
  });
}
```

#### 3.3.17 `src/content/index.js` (Entry Point)

```js
import { registerContentMessageHandlers } from './message-handler.js';
import { startAudioObserver } from './audio/observer.js';
import { registerRecordingListeners } from './recording.js';
import { registerFocusTracking } from './dom/visibility.js';

// Registrar listeners
registerContentMessageHandlers();
registerRecordingListeners();
registerFocusTracking();

// Iniciar observer de audio
startAudioObserver();
```

---

### FASE 4: Modularizar `sidepanel.js`

El `sidepanel.js` tiene ~900 líneas y mezcla UI, estado y lógica de negocio.

#### 3.4.1 `src/sidepanel/dom-refs.js`

**Extraer:** todas las referencias `document.getElementById(...)`.

```js
export const refs = {
  btnAnalizar: document.getElementById('btnAnalizar'),
  chkAutoScan: document.getElementById('chkAutoScan'),
  btnLimpiar: document.getElementById('btnLimpiar'),
  btnConfig: document.getElementById('btnConfig'),
  btnExportLogs: document.getElementById('btnExportLogs'),
  // ... (todas las ~20 referencias)
};
```

#### 3.4.2 `src/sidepanel/state.js`

**Extraer:** todas las variables de estado mutable.

```js
export let lastAnalysisData = null;
export let chatHistory = [];
export let isRecording = false;
export let recordedSteps = [];
export let savedJourneys = [];
export let savedTexts = [];
export let isPlaying = false;
export let stopPlaybackFlag = false;
export let editingTextId = null;
export let externalVariables = {};
export const PLAYBACK_DELAY_MS = 1000;

// Setters para cada variable mutable
export function setLastAnalysisData(v) { lastAnalysisData = v; }
export function setChatHistory(v) { chatHistory = v; }
// ... etc
```

#### 3.4.3 `src/sidepanel/config.js`

**Extraer:** lógica de `btnSaveConfig`, `btnConfig`, carga de `apiKey`/`modelId`.

#### 3.4.4 `src/sidepanel/tabs.js`

**Extraer:** `switchTab` y los event listeners de las pestañas.

#### 3.4.5 `src/sidepanel/backend-status.js`

**Extraer:** `renderBackendStatus` y la lógica de inicialización del estado del backend.

#### 3.4.6 `src/sidepanel/scan.js`

**Extraer:** `renderMap`, lógica de `btnAnalizar`, `chkAutoScan`, listener de `AUTO_UPDATE_MAP`.

#### 3.4.7 `src/sidepanel/chat.js`

**Extraer:** `handleSendMessage`, `callOpenRouter`, `addUserMessage`, `addAiMessage`.

#### 3.4.8 `src/sidepanel/search.js`

**Extraer:** listener de `searchInput`.

#### 3.4.9 `src/sidepanel/recording/controls.js`

**Extraer:** `startRecording`, `stopRecording`, `updateRecStepCount`, `btnRecord` handler.

#### 3.4.10 `src/sidepanel/recording/text-picker.js`

**Extraer:** `showTextPicker`, `btnAddTextStep` handler, `btnCloseTextPicker`.

#### 3.4.11 `src/sidepanel/recording/key-picker.js`

**Extraer:** `KEY_GROUPS`, `showKeyPicker`, `btnAddKeyStep` handler, `btnCloseKeyPicker`.

#### 3.4.12 `src/sidepanel/recording/wait-step.js`

**Extraer:** `btnAddWaitStep` handler.

#### 3.4.13 `src/sidepanel/journeys/persistence.js`

**Extraer:** `loadJourneys`, `saveJourneys`, `sendJourneysToPython` (la del sidepanel).

#### 3.4.14 `src/sidepanel/journeys/render.js`

**Extraer:** `renderJourneys`, `renameJourney`.

#### 3.4.15 `src/sidepanel/journeys/playback.js`

**Extraer:** `playJourney`, `btnStopPlayback` handler.

#### 3.4.16 `src/sidepanel/journeys/export.js`

**Extraer:** `exportJourneyAsFile`, `buildExportPayload`, `buildExportLocators`, `stepIsPasteText`.

#### 3.4.17 `src/sidepanel/texts/persistence.js`

**Extraer:** `loadTexts`, `saveTexts`.

#### 3.4.18 `src/sidepanel/texts/render.js`

**Extraer:** `renderTexts`, handlers de edición/borrado, `btnNewText`, `btnSaveText`, `btnCancelText`.

#### 3.4.19 `src/sidepanel/external-variables.js`

**Extraer:** `loadExternalVariables`, `resolveTemplateVariables`, listeners de `chrome.storage.onChanged` y `EXTERNAL_VARIABLES_UPDATED`.

#### 3.4.20 `src/sidepanel/audio-banner.js`

**Extraer:** `showAudioBanner`, `refreshMapWithAudio`, `bannerBtnStyle`.

#### 3.4.21 `src/sidepanel/index.js` (Entry Point)

```js
import { ClusivLogger } from '../shared/debug-logger.js';
import { initConfig } from './config.js';
import { initTabs } from './tabs.js';
import { initBackendStatus } from './backend-status.js';
import { initScan } from './scan.js';
import { initChat } from './chat.js';
import { initSearch } from './search.js';
import { initRecordingControls } from './recording/controls.js';
import { initTextPicker } from './recording/text-picker.js';
import { initKeyPicker } from './recording/key-picker.js';
import { initWaitStep } from './recording/wait-step.js';
import { initJourneyPersistence } from './journeys/persistence.js';
import { initTextsPersistence } from './texts/persistence.js';
import { initExternalVariables } from './external-variables.js';
import { initExportLogs } from './export-logs.js';
import { registerSidepanelMessageListeners } from './message-listeners.js';

// Inicializar todos los módulos
initBackendStatus();
initConfig();
initTabs();
initScan();
initChat();
initSearch();
initRecordingControls();
initTextPicker();
initKeyPicker();
initWaitStep();
initJourneyPersistence();
initTextsPersistence();
initExternalVariables();
initExportLogs();
registerSidepanelMessageListeners();
```

---

## 4. Orden de Ejecución para el Agente

El agente debe ejecutar las fases en este orden estricto:

| Paso | Acción | Validación |
|------|--------|------------|
| 1 | Crear `package.json`, ejecutar `npm install vite` | `node_modules/` existe |
| 2 | Crear estructura de carpetas (`mkdir -p src/...`) | Carpetas existen |
| 3 | Crear `vite.config.js` | Archivo existe y es válido |
| 4 | Crear `.gitignore` | Archivo existe |
| 5 | Crear `public/manifest.json` (copia modificada) | JSON válido con `"type": "module"` |
| 6 | Migrar `debug_logger.js` → `src/shared/debug-logger.js` | Exporta `ClusivLogger` |
| 7 | Migrar `journey_runtime.js` → `src/shared/journey-runtime.js` | Exporta todas las funciones |
| 8 | Crear `src/background/constants.js` | Exports correctos |
| 9 | Crear `src/background/state.js` | Exports correctos |
| 10 | Crear `src/background/tab-manager.js` | Imports/exports correctos |
| 11 | Crear `src/background/python-bridge.js` | Imports/exports correctos |
| 12 | Crear `src/background/ws-template.js` | Imports/exports correctos |
| 13 | Crear `src/background/ws-control.js` | Imports/exports correctos |
| 14 | Crear `src/background/journey-executor.js` | Imports/exports correctos |
| 15 | Crear `src/background/message-handler.js` | Imports/exports correctos |
| 16 | Crear `src/background/index.js` | Build sin errores |
| 17 | Crear `src/content/constants.js` | Exports correctos |
| 18 | Crear `src/content/dom/*.js` (5 archivos) | Exports correctos |
| 19 | Crear `src/content/interactions/*.js` (3 archivos) | Exports correctos |
| 20 | Crear `src/content/audio/*.js` (3 archivos) | Exports correctos |
| 21 | Crear `src/content/recording.js` | Exports correctos |
| 22 | Crear `src/content/auto-scan.js` | Exports correctos |
| 23 | Crear `src/content/validation.js` | Exports correctos |
| 24 | Crear `src/content/message-handler.js` | Imports correctos |
| 25 | Crear `src/content/index.js` | Build sin errores |
| 26 | Crear `src/sidepanel/dom-refs.js` y `src/sidepanel/state.js` | Exports correctos |
| 27 | Crear `src/sidepanel/config.js` a `src/sidepanel/audio-banner.js` (15 archivos) | Imports/exports correctos |
| 28 | Crear `src/sidepanel/index.js` | Build sin errores |
| 29 | Copiar `sidepanel.html` a raíz, actualizar script tags | HTML válido |
| 30 | Ejecutar `npm run build` | `dist/` generado con `background.js`, `content.js`, `sidepanel.js`, `manifest.json`, `sidepanel.html` |
| 31 | Cargar extensión desde `dist/` en Chrome | Extensión se carga sin errores |

---

## 5. Reglas Críticas para el Agente

### 5.1 Reglas de Imports/Exports
- **NUNCA** usar `require()` — solo `import`/`export` ES modules
- **NUNCA** usar `globalThis` ni `self` para compartir módulos — usar imports
- Todo módulo que necesite ser usado por otro módulo **DEBE** tener `export`
- Los imports entre módulos del mismo entry point usan paths relativos: `'./state.js'`, `'../shared/debug-logger.js'`

### 5.2 Reglas de Chrome Extension
- `background.js` es un Service Worker — **NO tiene acceso a `document`** ni `window`
- `content.js` **NO tiene acceso a `chrome.storage.session`** (solo `chrome.storage.local` y `chrome.runtime`)
- Los `chrome.runtime.onMessage.addListener` deben retornar `true` para respuestas asíncronas
- **NO** se puede importar código entre entry points en runtime — Vite bundlea todo en tiempo de build

### 5.3 Reglas de Vite
- Cada entry point (background, content, sidepanel) genera un archivo de salida independiente
- Los módulos compartidos (`shared/`) se **duplican** en cada bundle (no se generan chunks compartidos)
- `sidepanel.html` debe estar en `dist/` junto a los JS — copiarla manualmente o desde `public/`
- Si hay problemas con `format: 'iife'` y múltiples inputs, usar `format: 'es'` con `"type": "module"` en el manifest

### 5.4 Preservación de Lógica
- **CERO cambios en la lógica de negocio** — solo reestructurar en módulos
- Todos los nombres de funciones, variables y constantes se mantienen idénticos
- Los mensajes de Chrome (`action: "ANALYZE_DOM"`, etc.) no cambian
- Los keys de `chrome.storage` no cambian

---

## 6. Manejo de `sidepanel.html`

El archivo `sidepanel.html` necesita tratamiento especial:

1. Copiar a `public/sidepanel.html` para que Vite lo copie a `dist/`
2. **Eliminar** las 3 líneas de `<script>` originales:
   ```html
   <!-- ELIMINAR estas 3 líneas: -->
   <script src="debug_logger.js"></script>
   <script src="journey_runtime.js"></script>
   <script src="sidepanel.js"></script>
   ```
3. **Agregar** un solo script module:
   ```html
   <script type="module" src="./sidepanel.js"></script>
   ```
4. Los estilos CSS inline se mantienen sin cambios (opcionalmente se pueden extraer a un `.css` en una fase futura)

---

## 7. Verificación Post-Migración

Después de ejecutar `npm run build`, verificar:

1. **`dist/` contiene:** `background.js`, `content.js`, `sidepanel.js`, `sidepanel.html`, `manifest.json`
2. **Cargar en Chrome:** `chrome://extensions` → "Load unpacked" → seleccionar carpeta `dist/`
3. **Sin errores en consola:** revisar la consola del service worker, del content script y del sidepanel
4. **Funcionalidades a probar:**
   - [ ] El side panel se abre al hacer clic en el ícono
   - [ ] El status del backend se muestra correctamente
   - [ ] El botón "Escanear Manual" funciona
   - [ ] Auto-scan funciona
   - [ ] Grabación de journeys funciona
   - [ ] Reproducción de journeys funciona
   - [ ] Chat AI funciona
   - [ ] Textos CRUD funciona
   - [ ] Exportación de journeys funciona
   - [ ] Exportación de logs funciona
   - [ ] WebSocket de control se conecta y reconecta
   - [ ] WebSocket de variables se conecta y reconecta
   - [ ] Detección de audio funciona
   - [ ] Las variables externas se sincronizan

---

## 8. Dependencias Circulares a Evitar

Los siguientes pares de módulos tienen riesgo de dependencia circular. El agente debe asegurarse de que **NO** ocurran:

| Módulo A | Módulo B | Resolución |
|----------|----------|------------|
| `ws-control.js` | `journey-executor.js` | `ws-control` importa `journey-executor`, pero NO al revés. `journey-executor` usa `sendStatusToPython` de `python-bridge`, no de `ws-control` |
| `ws-control.js` | `python-bridge.js` | `python-bridge` importa `state.ws` para enviar, `ws-control` importa `python-bridge.sendJourneysToPython`. Resolver haciendo que `python-bridge` lea `state.ws` directamente, no lo importe de `ws-control` |
| `state.js` | Cualquier otro | `state.js` **NUNCA** importa de otros módulos del background. Es la hoja del grafo de dependencias |

---

## 9. Diagrama de Dependencias por Entry Point

### Background
```
index.js
├── shared/debug-logger.js
├── constants.js
├── state.js ← (sin dependencias internas)
├── ws-control.js
│   ├── shared/debug-logger.js
│   ├── constants.js
│   ├── state.js
│   ├── python-bridge.js
│   ├── tab-manager.js
│   └── journey-executor.js
├── ws-template.js
│   ├── shared/debug-logger.js
│   ├── constants.js
│   └── state.js
├── tab-manager.js
│   ├── shared/debug-logger.js
│   ├── constants.js
│   └── state.js
├── journey-executor.js
│   ├── shared/debug-logger.js
│   ├── shared/journey-runtime.js
│   ├── state.js
│   ├── python-bridge.js
│   └── tab-manager.js
├── python-bridge.js
│   ├── shared/debug-logger.js
│   └── state.js
└── message-handler.js
    ├── shared/debug-logger.js
    └── state.js
```

### Content
```
index.js
├── message-handler.js
│   ├── dom/semantic-map.js
│   ├── interactions/click.js
│   ├── interactions/paste.js
│   ├── interactions/keyboard.js
│   ├── auto-scan.js
│   ├── recording.js
│   ├── validation.js
│   ├── audio/controls.js
│   └── audio/download.js
├── audio/observer.js
└── recording.js
```

### Sidepanel
```
index.js
├── shared/debug-logger.js
├── shared/journey-runtime.js
├── dom-refs.js
├── state.js
├── config.js
├── tabs.js
├── backend-status.js
├── scan.js
├── chat.js
├── search.js
├── recording/controls.js
├── recording/text-picker.js
├── recording/key-picker.js
├── recording/wait-step.js
├── journeys/persistence.js
├── journeys/render.js
├── journeys/playback.js
├── journeys/export.js
├── texts/persistence.js
├── texts/render.js
├── external-variables.js
└── audio-banner.js
```