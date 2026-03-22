# Plan de implementación: Textos guardados en Journeys
**Extensión:** Analista Web AI Pro v4.0  
**Objetivo:** Permitir insertar pasos de tipo "pegar texto guardado" dentro de un journey durante la grabación.  
**Archivos afectados:** `sidepanel.html`, `sidepanel.js`  
**Archivos sin cambios:** `background.js`, `content.js`, `manifest.json`

---

## Contexto del sistema actual

Antes de aplicar cualquier cambio, el agente debe entender estas estructuras existentes:

### Estructura de un Journey (actual)
```js
{
  id: 'j-1234567890',
  name: 'Nombre del journey',
  createdAt: '...',
  steps: [
    {
      aiRef: 'ai-xxxxx',       // data-ai-ref del elemento
      text: 'Texto del botón', // texto visible del elemento
      selector: '#btn-enviar', // selector CSS
      locator: { ... }         // objeto de localización detallado
    }
    // Todos los pasos son implícitamente tipo "click"
  ]
}
```

### Estructura de savedTexts (nueva — a crear)
```js
{
  id: 'txt-1234567890',   // generado con 'txt-' + Date.now()
  name: 'Script intro',   // nombre legible dado por el usuario
  content: 'Hola, ...'   // contenido completo del texto
}
```

### Estructura de paso tipo paste_text (nueva — a agregar en steps[])
```js
{
  stepType: 'paste_text',      // discriminador — ausente en pasos click existentes
  textId: 'txt-1234567890',    // referencia al texto guardado
  textName: 'Script intro',    // copia del nombre, para mostrar en UI sin leer storage
  // NO incluir "content" aquí — se resuelve desde savedTexts en reproducción
}
```

---

## Resumen de cambios

| Archivo | Tipo de cambio | Descripción |
|---|---|---|
| `sidepanel.html` | Adición | Nueva pestaña "Textos" en el nav |
| `sidepanel.html` | Adición | Vista `#viewTexts` con formulario y lista |
| `sidepanel.html` | Adición | Botón `#btnAddTextStep` en la barra de grabación |
| `sidepanel.html` | Adición | Panel flotante `#textPickerPanel` (dropdown de selección) |
| `sidepanel.html` | Adición | Estilos CSS para todos los elementos nuevos |
| `sidepanel.js` | Adición | Variable `savedTexts` y funciones CRUD |
| `sidepanel.js` | Adición | `renderTexts()` — lista de textos con editar/borrar |
| `sidepanel.js` | Adición | `showTextPicker()` — muestra panel de selección durante grabación |
| `sidepanel.js` | Modificación | `switchTab()` — agregar caso `'texts'` |
| `sidepanel.js` | Modificación | `renderMap()` — nada cambia |
| `sidepanel.js` | Modificación | `renderJourneys()` — mostrar pasos `paste_text` con etiqueta diferenciada |
| `sidepanel.js` | Modificación | `playJourney()` — manejar pasos `paste_text` al reproducir |
| `sidepanel.js` | Modificación | `updateRecStepCount()` — contar ambos tipos de pasos correctamente |

---

## PASO 1 — `sidepanel.html`: nueva pestaña en el nav

### 1.1 Agregar tab "Textos" en `.tabs`

**Ubicar este bloque existente:**
```html
<div class="tabs">
    <div class="tab active" id="tabLogs">🗺️ Mapa DOM</div>
    <div class="tab" id="tabChat">💬 Chat AI</div>
    <div class="tab" id="tabJourneys">🎬 Journeys</div>
</div>
```

**Reemplazarlo por:**
```html
<div class="tabs">
    <div class="tab active" id="tabLogs">🗺️ Mapa DOM</div>
    <div class="tab" id="tabChat">💬 Chat AI</div>
    <div class="tab" id="tabJourneys">🎬 Journeys</div>
    <div class="tab" id="tabTexts">📝 Textos</div>
</div>
```

---

## PASO 2 — `sidepanel.html`: nueva vista `#viewTexts`

### 2.1 Agregar vista dentro de `#mainContent`

**Ubicar el cierre de `#viewJourneys`:**
```html
        <div id="viewJourneys">
            <div id="journeysList">
                <div class="journey-empty">No hay secuencias guardadas.</div>
            </div>
        </div>
    </div>
```

**Reemplazarlo por:**
```html
        <div id="viewJourneys">
            <div id="journeysList">
                <div class="journey-empty">No hay secuencias guardadas.</div>
            </div>
        </div>

        <div id="viewTexts">
            <div class="texts-toolbar">
                <button id="btnNewText">+ Nuevo texto</button>
            </div>
            <div id="textEditorPanel" style="display:none;">
                <input type="text" id="textNameInput" placeholder="Nombre del texto (ej: Script intro)">
                <textarea id="textContentInput" placeholder="Escribe o pega el contenido aquí..."></textarea>
                <div class="text-editor-actions">
                    <button id="btnSaveText">💾 Guardar</button>
                    <button id="btnCancelText">Cancelar</button>
                </div>
            </div>
            <div id="textsList">
                <div class="journey-empty">No hay textos guardados.</div>
            </div>
        </div>
    </div>
```

---

## PASO 3 — `sidepanel.html`: botón en barra de grabación + panel picker

### 3.1 Agregar botón `#btnAddTextStep` en la barra de grabación

**Ubicar el bloque existente:**
```html
<div class="recording-bar" id="recordingBar">
    <button id="btnRecord">⏺ Grabar</button>
    <span class="rec-step-count" id="recStepCount">0 pasos</span>
</div>
```

**Reemplazarlo por:**
```html
<div class="recording-bar" id="recordingBar">
    <button id="btnRecord">⏺ Grabar</button>
    <span class="rec-step-count" id="recStepCount">0 pasos</span>
    <button id="btnAddTextStep" title="Insertar texto guardado como paso">📝 +Texto</button>
</div>
```

### 3.2 Agregar panel flotante `#textPickerPanel`

**Ubicar el `<div class="playback-overlay"...>` existente:**
```html
<div class="playback-overlay" id="playbackOverlay">
```

**Insertar ANTES de esa línea:**
```html
<div id="textPickerPanel" style="display:none;">
    <div class="text-picker-header">
        <span>Seleccionar texto a insertar</span>
        <button id="btnCloseTextPicker">✕</button>
    </div>
    <div id="textPickerList"></div>
</div>
```

---

## PASO 4 — `sidepanel.html`: estilos CSS

### 4.1 Agregar estilos al bloque `<style>` existente

**Localizar el cierre de la etiqueta `</style>` dentro de `<head>` y agregar antes de ella:**

```css
/* --- VISTA TEXTOS --- */
#viewTexts {
    display: none;
    height: 100%;
    flex-direction: column;
    background: white;
    overflow-y: auto;
}

#viewTexts.active {
    display: flex;
}

.texts-toolbar {
    padding: 8px 12px;
    background: #f8f9fa;
    border-bottom: 1px solid #ddd;
}

.texts-toolbar button {
    background: #27ae60;
    font-size: 11px;
    padding: 6px 12px;
}

#textEditorPanel {
    padding: 10px 12px;
    background: #f1f3f5;
    border-bottom: 1px solid #ddd;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

#textNameInput {
    padding: 7px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 12px;
    width: 100%;
    box-sizing: border-box;
}

#textContentInput {
    padding: 7px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 12px;
    width: 100%;
    box-sizing: border-box;
    min-height: 100px;
    resize: vertical;
    font-family: monospace;
}

.text-editor-actions {
    display: flex;
    gap: 6px;
}

.text-editor-actions button {
    font-size: 11px;
    padding: 6px 12px;
}

#btnCancelText {
    background: #7f8c8d;
}

.text-item {
    padding: 8px 12px;
    border-bottom: 1px solid #f1f1f1;
    display: flex;
    align-items: center;
    gap: 8px;
}

.text-item-info {
    flex: 1;
    min-width: 0;
}

.text-item-info b {
    display: block;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.text-item-info span {
    font-size: 10px;
    color: #999;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
}

.text-item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.btn-edit-text {
    background: #2980b9;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
}

.btn-delete-text {
    background: #e74c3c;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
}

/* --- BOTÓN +TEXTO EN BARRA DE GRABACIÓN --- */
#btnAddTextStep {
    background: #8e44ad;
    font-size: 10px;
    padding: 5px 8px;
    display: none; /* visible solo cuando isRecording=true */
}

#btnAddTextStep.visible {
    display: inline-block;
}

/* --- PANEL PICKER DE TEXTOS --- */
#textPickerPanel {
    position: absolute;
    bottom: 60px;
    left: 8px;
    right: 8px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    z-index: 200;
    max-height: 260px;
    display: flex;
    flex-direction: column;
}

.text-picker-header {
    padding: 8px 12px;
    background: #8e44ad;
    color: white;
    border-radius: 8px 8px 0 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: bold;
}

.text-picker-header button {
    background: transparent;
    color: white;
    font-size: 13px;
    padding: 0 4px;
}

#textPickerList {
    overflow-y: auto;
    flex: 1;
}

.text-picker-item {
    padding: 9px 12px;
    border-bottom: 1px solid #f1f1f1;
    cursor: pointer;
    font-size: 12px;
}

.text-picker-item:hover {
    background: #f0e6fa;
}

.text-picker-item b {
    display: block;
    color: #6c3483;
}

.text-picker-item span {
    color: #999;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
}

.text-picker-empty {
    padding: 20px;
    text-align: center;
    color: #999;
    font-size: 12px;
}

/* --- PASO TIPO PASTE_TEXT EN LISTA DE STEPS --- */
.step-item.step-type-paste {
    background: #f5eeff;
    border-left: 3px solid #8e44ad;
}

.step-paste-badge {
    font-size: 9px;
    background: #8e44ad;
    color: white;
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
}
```

---

## PASO 5 — `sidepanel.js`: variables y persistencia de textos

### 5.1 Declarar variable `savedTexts`

**Localizar el bloque de declaración de variables de estado existente:**
```js
let isRecording = false;
let recordedSteps = [];
let savedJourneys = [];
let isPlaying = false;
let stopPlaybackFlag = false;
const PLAYBACK_DELAY_MS = 1000;
```

**Reemplazarlo por:**
```js
let isRecording = false;
let recordedSteps = [];
let savedJourneys = [];
let savedTexts = [];
let isPlaying = false;
let stopPlaybackFlag = false;
const PLAYBACK_DELAY_MS = 1000;
let editingTextId = null; // null = nuevo, string = editando existente
```

### 5.2 Agregar funciones de persistencia de textos

**Localizar la función `loadJourneys()` existente:**
```js
function loadJourneys() {
    chrome.storage.local.get(['savedJourneys'], (res) => {
        savedJourneys = res.savedJourneys || [];
    });
}

function saveJourneys() {
    chrome.storage.local.set({ savedJourneys });
}

loadJourneys();
```

**Agregar inmediatamente DESPUÉS de ese bloque:**
```js
function loadTexts() {
    chrome.storage.local.get(['savedTexts'], (res) => {
        savedTexts = res.savedTexts || [];
    });
}

function saveTexts() {
    chrome.storage.local.set({ savedTexts });
}

loadTexts();
```

---

## PASO 6 — `sidepanel.js`: CRUD de textos

### 6.1 Agregar función `renderTexts()`

**Ubicar la función `renderJourneys()`. Agregar ANTES de ella:**

```js
function renderTexts() {
    const textsList = document.getElementById('textsList');
    const editorPanel = document.getElementById('textEditorPanel');
    textsList.innerHTML = '';
    editorPanel.style.display = 'none';
    editingTextId = null;
    document.getElementById('textNameInput').value = '';
    document.getElementById('textContentInput').value = '';

    if (savedTexts.length === 0) {
        textsList.innerHTML = '<div class="journey-empty">No hay textos guardados.</div>';
        return;
    }

    savedTexts.forEach((txt) => {
        const div = document.createElement('div');
        div.className = 'text-item';
        const preview = txt.content.replace(/\s+/g, ' ').trim().slice(0, 60);
        div.innerHTML = `
            <div class="text-item-info">
                <b>${txt.name}</b>
                <span>${preview}${txt.content.length > 60 ? '...' : ''}</span>
            </div>
            <div class="text-item-actions">
                <button class="btn-edit-text" data-id="${txt.id}" title="Editar">✏</button>
                <button class="btn-delete-text" data-id="${txt.id}" title="Eliminar">🗑</button>
            </div>
        `;
        textsList.appendChild(div);
    });

    textsList.querySelectorAll('.btn-edit-text').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const txt = savedTexts.find(t => t.id === id);
            if (!txt) return;
            editingTextId = id;
            document.getElementById('textNameInput').value = txt.name;
            document.getElementById('textContentInput').value = txt.content;
            document.getElementById('textEditorPanel').style.display = 'flex';
        });
    });

    textsList.querySelectorAll('.btn-delete-text').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const txt = savedTexts.find(t => t.id === id);
            if (!txt) return;
            if (confirm(`¿Eliminar el texto "${txt.name}"?`)) {
                savedTexts = savedTexts.filter(t => t.id !== id);
                saveTexts();
                renderTexts();
            }
        });
    });
}
```

### 6.2 Agregar listeners del editor de textos

**Localizar el bloque `loadJourneys();` (al final del bloque de persistencia). Agregar DESPUÉS de `loadTexts();`:**

```js
document.getElementById('btnNewText').addEventListener('click', () => {
    editingTextId = null;
    document.getElementById('textNameInput').value = '';
    document.getElementById('textContentInput').value = '';
    document.getElementById('textEditorPanel').style.display = 'flex';
    document.getElementById('textNameInput').focus();
});

document.getElementById('btnCancelText').addEventListener('click', () => {
    document.getElementById('textEditorPanel').style.display = 'none';
    editingTextId = null;
});

document.getElementById('btnSaveText').addEventListener('click', () => {
    const name = document.getElementById('textNameInput').value.trim();
    const content = document.getElementById('textContentInput').value;

    if (!name) {
        alert('El texto necesita un nombre.');
        return;
    }
    if (!content.trim()) {
        alert('El contenido no puede estar vacío.');
        return;
    }

    if (editingTextId) {
        const idx = savedTexts.findIndex(t => t.id === editingTextId);
        if (idx !== -1) {
            savedTexts[idx].name = name;
            savedTexts[idx].content = content;
        }
    } else {
        savedTexts.push({
            id: 'txt-' + Date.now(),
            name,
            content
        });
    }

    saveTexts();
    renderTexts();
});
```

---

## PASO 7 — `sidepanel.js`: pestaña Textos en `switchTab()`

### 7.1 Modificar `switchTab()`

**Localizar la función `switchTab()` existente:**
```js
function switchTab(target) {
    document.getElementById('tabLogs').classList.toggle('active', target === 'logs');
    document.getElementById('tabChat').classList.toggle('active', target === 'chat');
    document.getElementById('tabJourneys').classList.toggle('active', target === 'journeys');
    document.getElementById('viewLogs').classList.toggle('active', target === 'logs');
    document.getElementById('viewChat').classList.toggle('active', target === 'chat');
    document.getElementById('viewJourneys').classList.toggle('active', target === 'journeys');
    if (target === 'journeys') renderJourneys();
}
```

**Reemplazarla por:**
```js
function switchTab(target) {
    document.getElementById('tabLogs').classList.toggle('active', target === 'logs');
    document.getElementById('tabChat').classList.toggle('active', target === 'chat');
    document.getElementById('tabJourneys').classList.toggle('active', target === 'journeys');
    document.getElementById('tabTexts').classList.toggle('active', target === 'texts');
    document.getElementById('viewLogs').classList.toggle('active', target === 'logs');
    document.getElementById('viewChat').classList.toggle('active', target === 'chat');
    document.getElementById('viewJourneys').classList.toggle('active', target === 'journeys');
    document.getElementById('viewTexts').classList.toggle('active', target === 'texts');
    if (target === 'journeys') renderJourneys();
    if (target === 'texts') renderTexts();
}
```

### 7.2 Agregar listener para la pestaña Textos

**Localizar los listeners de pestañas existentes:**
```js
document.getElementById('tabLogs').addEventListener('click', () => switchTab('logs'));
document.getElementById('tabChat').addEventListener('click', () => switchTab('chat'));
document.getElementById('tabJourneys').addEventListener('click', () => switchTab('journeys'));
```

**Agregar a continuación:**
```js
document.getElementById('tabTexts').addEventListener('click', () => switchTab('texts'));
```

---

## PASO 8 — `sidepanel.js`: botón `+Texto` durante grabación

### 8.1 Agregar función `showTextPicker()`

**Agregar ANTES de la función `startRecording()`:**

```js
function showTextPicker() {
    const panel = document.getElementById('textPickerPanel');
    const list = document.getElementById('textPickerList');
    list.innerHTML = '';

    if (savedTexts.length === 0) {
        list.innerHTML = '<div class="text-picker-empty">No hay textos guardados.<br>Ve a la pestaña Textos para crear uno.</div>';
    } else {
        savedTexts.forEach(txt => {
            const item = document.createElement('div');
            item.className = 'text-picker-item';
            const preview = txt.content.replace(/\s+/g, ' ').trim().slice(0, 50);
            item.innerHTML = `<b>${txt.name}</b><span>${preview}${txt.content.length > 50 ? '...' : ''}</span>`;
            item.addEventListener('click', () => {
                recordedSteps.push({
                    stepType: 'paste_text',
                    textId: txt.id,
                    textName: txt.name
                });
                updateRecStepCount();
                panel.style.display = 'none';
            });
            list.appendChild(item);
        });
    }

    panel.style.display = 'flex';
}
```

### 8.2 Agregar listener del botón `#btnAddTextStep`

**Localizar el listener `btnRecord.addEventListener(...)` existente:**
```js
btnRecord.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});
```

**Agregar DESPUÉS de ese bloque:**
```js
document.getElementById('btnAddTextStep').addEventListener('click', () => {
    showTextPicker();
});

document.getElementById('btnCloseTextPicker').addEventListener('click', () => {
    document.getElementById('textPickerPanel').style.display = 'none';
});
```

### 8.3 Hacer visible `#btnAddTextStep` durante grabación

**Localizar la función `startRecording()` existente:**
```js
async function startRecording() {
    isRecording = true;
    recordedSteps = [];
    updateRecStepCount();
    btnRecord.textContent = '⏹ Detener';
    btnRecord.classList.add('recording');
    recordingBar.classList.add('is-recording');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "START_RECORDING" }).catch(() => { });
    }
}
```

**Reemplazarla por:**
```js
async function startRecording() {
    isRecording = true;
    recordedSteps = [];
    updateRecStepCount();
    btnRecord.textContent = '⏹ Detener';
    btnRecord.classList.add('recording');
    recordingBar.classList.add('is-recording');
    document.getElementById('btnAddTextStep').classList.add('visible');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "START_RECORDING" }).catch(() => { });
    }
}
```

**Localizar la función `stopRecording()` existente. Dentro de ella, localizar:**
```js
    isRecording = false;
    btnRecord.textContent = '⏺ Grabar';
    btnRecord.classList.remove('recording');
    recordingBar.classList.remove('is-recording');
```

**Agregar una línea a continuación:**
```js
    isRecording = false;
    btnRecord.textContent = '⏺ Grabar';
    btnRecord.classList.remove('recording');
    recordingBar.classList.remove('is-recording');
    document.getElementById('btnAddTextStep').classList.remove('visible');
    document.getElementById('textPickerPanel').style.display = 'none';
```

---

## PASO 9 — `sidepanel.js`: reproducción con pasos `paste_text`

### 9.1 Modificar `playJourney()` para manejar pasos `paste_text`

**Localizar el bucle `for` dentro de `playJourney()`:**
```js
    for (let i = 0; i < journey.steps.length; i++) {
        if (stopPlaybackFlag) break;

        const step = journey.steps[i];
        playbackStepLabel.textContent = `Paso ${i + 1}/${journey.steps.length}: ${step.text}`;

        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: "SIMULATE_CLICK",
                id: step.aiRef,
                selector: step.selector,
                text: step.text,
                locator: step.locator || null
            });
        } catch (e) {
            playbackStepLabel.textContent = `⚠️ Error en paso ${i + 1}: elemento no encontrado`;
        }

        if (i < journey.steps.length - 1 && !stopPlaybackFlag) {
            await new Promise(resolve => setTimeout(resolve, PLAYBACK_DELAY_MS));
        }
    }
```

**Reemplazarlo por:**
```js
    for (let i = 0; i < journey.steps.length; i++) {
        if (stopPlaybackFlag) break;

        const step = journey.steps[i];

        if (step.stepType === 'paste_text') {
            playbackStepLabel.textContent = `Paso ${i + 1}/${journey.steps.length}: [Texto] ${step.textName}`;

            // Resolver el contenido desde savedTexts
            const txtRecord = savedTexts.find(t => t.id === step.textId);
            if (!txtRecord) {
                playbackStepLabel.textContent = `⚠️ Paso ${i + 1}: texto "${step.textName}" no encontrado`;
                await new Promise(resolve => setTimeout(resolve, PLAYBACK_DELAY_MS));
                continue;
            }

            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: "PASTE_TEXT",
                    text: txtRecord.content
                });
            } catch (e) {
                playbackStepLabel.textContent = `⚠️ Error en paso ${i + 1}: no se pudo pegar el texto`;
            }

        } else {
            // Paso tipo click (comportamiento original)
            playbackStepLabel.textContent = `Paso ${i + 1}/${journey.steps.length}: ${step.text}`;

            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: "SIMULATE_CLICK",
                    id: step.aiRef,
                    selector: step.selector,
                    text: step.text,
                    locator: step.locator || null
                });
            } catch (e) {
                playbackStepLabel.textContent = `⚠️ Error en paso ${i + 1}: elemento no encontrado`;
            }
        }

        if (i < journey.steps.length - 1 && !stopPlaybackFlag) {
            await new Promise(resolve => setTimeout(resolve, PLAYBACK_DELAY_MS));
        }
    }
```

---

## PASO 10 — `sidepanel.js`: UI de steps en la lista de journeys

### 10.1 Diferenciar visualmente pasos `paste_text` en `renderJourneys()`

**Localizar dentro de `renderJourneys()` la parte que construye cada `stepDiv`:**
```js
        if (journey.steps && journey.steps.length > 0) {
            journey.steps.forEach((step, stepIdx) => {
                const stepDiv = document.createElement('div');
                stepDiv.className = 'step-item';

                // Truncate selector for display
                const selectorDisplay = step.selector ? (step.selector.length > 30 ? '...' + step.selector.slice(-30) : step.selector) : '';

                stepDiv.innerHTML = `
                    <span class="step-index">#${stepIdx + 1}</span>
                    <span class="step-desc" title="${step.text || step.selector}">${step.text || 'Acción sin nombre'}</span>
                    <span class="step-selector" title="${step.selector || ''}
">${selectorDisplay}</span>
                `;
                stepsContainer.appendChild(stepDiv);
            });
```

**Reemplazarlo por:**
```js
        if (journey.steps && journey.steps.length > 0) {
            journey.steps.forEach((step, stepIdx) => {
                const stepDiv = document.createElement('div');

                if (step.stepType === 'paste_text') {
                    stepDiv.className = 'step-item step-type-paste';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-paste-badge">TEXTO</span>
                        <span class="step-desc" title="${step.textName}">${step.textName}</span>
                    `;
                } else {
                    stepDiv.className = 'step-item';
                    const selectorDisplay = step.selector ? (step.selector.length > 30 ? '...' + step.selector.slice(-30) : step.selector) : '';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-desc" title="${step.text || step.selector}">${step.text || 'Acción sin nombre'}</span>
                        <span class="step-selector" title="${step.selector || ''}">${selectorDisplay}</span>
                    `;
                }
                stepsContainer.appendChild(stepDiv);
            });
```

---

## PASO 11 — `sidepanel.js`: exportación compatible con pasos `paste_text`

El agente debe verificar que `buildExportPayload()` ya maneja `stepIsPasteText()` correctamente. La función existente usa `step.action === 'paste_text'` como condición, pero el nuevo campo es `step.stepType`. 

### 11.1 Modificar `stepIsPasteText()` para detectar el nuevo campo

**Localizar la función `stepIsPasteText()` existente:**
```js
function stepIsPasteText(step) {
    if (step.action === 'paste_text') return true;
    if (step.textToPaste || step.text_to_paste) return true;
    if (step.locator?.role === 'textbox') return true;
    if (step.isEditable === true) return true;

    const editableHints = ['textarea', 'input', 'contenteditable', 'textbox', 'searchbox', 'editor'];
    const textLower = (step.text || '').toLowerCase();
    const tagLower = (step.locator?.tag || '').toLowerCase();

    return editableHints.some((hint) => textLower.includes(hint) || tagLower.includes(hint));
}
```

**Reemplazarla por:**
```js
function stepIsPasteText(step) {
    if (step.stepType === 'paste_text') return true; // nuevo campo canónico
    if (step.action === 'paste_text') return true;
    if (step.textToPaste || step.text_to_paste) return true;
    if (step.locator?.role === 'textbox') return true;
    if (step.isEditable === true) return true;

    const editableHints = ['textarea', 'input', 'contenteditable', 'textbox', 'searchbox', 'editor'];
    const textLower = (step.text || '').toLowerCase();
    const tagLower = (step.locator?.tag || '').toLowerCase();

    return editableHints.some((hint) => textLower.includes(hint) || tagLower.includes(hint));
}
```

### 11.2 Enriquecer el paso exportado con `textId` y `textName`

**Localizar dentro de `buildExportPayload()` la parte que construye cada paso exportado:**
```js
        return {
            index: index + 1,
            action: isPaste ? 'paste_text' : 'click',
            description: step.text || `Paso ${index + 1}`,
            text_to_paste: isPaste ? (step.textToPaste || step.text_to_paste || null) : null,
            locators,
            ...
        };
```

**Reemplazarlo por:**
```js
        // Para pasos paste_text creados con el nuevo sistema,
        // resolver el contenido desde savedTexts en el momento de exportar
        let resolvedContent = null;
        if (isPaste && step.stepType === 'paste_text' && step.textId) {
            const txtRecord = savedTexts.find(t => t.id === step.textId);
            resolvedContent = txtRecord ? txtRecord.content : null;
        }

        return {
            index: index + 1,
            action: isPaste ? 'paste_text' : 'click',
            description: step.stepType === 'paste_text' ? `[Texto] ${step.textName}` : (step.text || `Paso ${index + 1}`),
            text_to_paste: isPaste ? (resolvedContent || step.textToPaste || step.text_to_paste || null) : null,
            text_ref: step.stepType === 'paste_text' ? { id: step.textId, name: step.textName } : null,
            locators,
            ...
        };
```

---

## PASO 12 — Compatibilidad con `background.js` (executeJourney)

**No se requieren cambios en `background.js`.** 

La función `executeJourney()` en `background.js` ya maneja texto a pegar mediante el campo `textToPaste` del journey completo (pasado desde Python). Los pasos individuales `paste_text` son reproducidos únicamente desde `sidepanel.js` → `playJourney()`.

Sin embargo, si en el futuro se desea que Python pueda ejecutar journeys con pasos `paste_text`, el agente debe agregar en `executeJourney()` lógica análoga al PASO 9: detectar `step.stepType === 'paste_text'`, leer el contenido desde storage y enviar `PASTE_TEXT` en vez de `SIMULATE_CLICK`.

---

## Checklist de verificación post-implementación

El agente debe confirmar cada punto antes de declarar la tarea completa:

- [ ] La pestaña "📝 Textos" aparece en el nav junto a Journeys
- [ ] Al hacer clic en "Textos" se muestra la vista correcta
- [ ] El botón "+ Nuevo texto" abre el formulario de edición
- [ ] Se puede guardar un texto con nombre y contenido
- [ ] Los textos guardados aparecen en la lista con preview
- [ ] Se puede editar un texto existente (el formulario se rellena con los datos actuales)
- [ ] Se puede eliminar un texto con confirmación
- [ ] Los textos persisten al cerrar y reabrir el panel (chrome.storage)
- [ ] Durante grabación activa, el botón "📝 +Texto" aparece en la barra
- [ ] Al hacer clic en "📝 +Texto" aparece el panel picker con los textos disponibles
- [ ] Al seleccionar un texto en el picker, se agrega un paso al journey y el panel se cierra
- [ ] El contador de pasos (`recStepCount`) incrementa correctamente al agregar un texto
- [ ] Al detener la grabación, el botón "📝 +Texto" desaparece
- [ ] En la lista de journeys, los pasos `paste_text` se muestran con badge morado "TEXTO" y nombre del texto
- [ ] Al reproducir un journey, los pasos `paste_text` ejecutan `PASTE_TEXT` en la pestaña activa
- [ ] Si el texto referenciado fue eliminado, la reproducción muestra advertencia y continúa con el siguiente paso
- [ ] La exportación JSON incluye `text_to_paste` con el contenido resuelto y `text_ref` con el id/nombre

---

## Notas para el agente

1. **No modificar `content.js`** — `pasteTextWithRetries()` ya funciona correctamente y no requiere cambios.

2. **No modificar `background.js`** — la ejecución de pasos `paste_text` en journeys disparados por Python es un caso de uso futuro, fuera del alcance de este plan.

3. **No modificar `manifest.json`** — no se agregan nuevos permisos.

4. **Orden de aplicación de cambios:** Aplicar primero todos los cambios de `sidepanel.html` (pasos 1–4) y luego todos los de `sidepanel.js` (pasos 5–11). Esto evita referencias a elementos del DOM que aún no existen durante pruebas intermedias.

5. **El `#textPickerPanel` usa `position: absolute`** — requiere que su contenedor padre `#mainContent` tenga `position: relative`. Verificar que el CSS existente lo incluya; si no, agregar `position: relative;` a `#mainContent` en el bloque de estilos.

6. **Texto eliminado en journeys existentes** — si un texto es eliminado de `savedTexts`, los journeys que lo referencian no se rompen: `playJourney()` detecta `txtRecord === undefined` y muestra advertencia, luego continúa. No se requiere limpieza de referencias huérfanas.
