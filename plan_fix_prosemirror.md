# Plan de corrección: Reconocimiento del campo ProseMirror ("Ask anything")

## Contexto y objetivo

La extensión Chrome "Analista Web AI Pro" no detecta ni interactúa con el campo de entrada
`[contenteditable] .ProseMirror` que usan editores enriquecidos como el campo "Ask anything"
de Claude.ai. Este plan corrige las tres causas raíz en `content.js`.

**Archivo a modificar:** `content.js`  
**Archivos de solo lectura (no modificar):** `background.js`, `manifest.json`, `sidepanel.html`, `sidepanel.js`

---

## Diagnóstico de causas

| # | Causa | Ubicación en el código | Síntoma visible |
|---|-------|----------------------|-----------------|
| 1 | `[role='textbox']` y `.ProseMirror` ausentes de `INTERACTIVE_QUERY` | Líneas 1-35 de `content.js` | El campo no aparece en el mapa DOM del panel |
| 2 | `isVisibleElement` rechaza el div porque `offsetWidth/Height` puede ser `0` | Función `isVisibleElement` | El elemento se filtra antes de llegar al mapa |
| 3 | `insertTextIntoElement` no despacha el evento correcto para ProseMirror | Función `insertTextIntoElement` | El texto no se inserta aunque el elemento sea encontrado |

---

## Cambio 1 — Agregar selectores ProseMirror a `INTERACTIVE_QUERY`

### Ubicación exacta

Buscar el array `INTERACTIVE_QUERY` al inicio del archivo. Actualmente termina con:

```js
    "[tabindex='0']",
    ".btn", ".button",
    // ... (elementos de media)
    "wave"
].join(", ");
```

### Acción

Agregar los siguientes dos selectores **antes** del `.join(", ")`, después de `"[tabindex='0']"`:

```js
    "[role='textbox']",
    "[aria-multiline='true']",
    ".ProseMirror",
```

### Resultado esperado tras el cambio

```js
const INTERACTIVE_QUERY = [
    "button", "a", "input", "select", "textarea", "option",
    "[role='button']", "[role='link']", "[role='option']",
    "[role='menuitem']", "[role='menuitemcheckbox']", "[role='menuitemradio']",
    "[role='tab']", "[role='switch']", "[role='checkbox']", "[role='radio']",
    "[role='combobox']", "[role='listbox']", "[role='searchbox']",
    "[role='slider']", "[role='spinbutton']", "[role='treeitem']",
    "[tabindex='0']",
    "[role='textbox']",           // ← NUEVO
    "[aria-multiline='true']",    // ← NUEVO
    ".ProseMirror",               // ← NUEVO
    ".btn", ".button",
    ".mat-mdc-option", ".mdc-list-item", ".mat-option",
    ".dropdown-item", ".menu-item",
    "[onclick]", "[ng-click]", "[data-action]",
    "audio",
    "video",
    "[class*='audio']",
    "[class*='player']",
    "[class*='waveform']",
    "[class*='speech']",
    ".wavesurfer-wrapper",
    "wave"
].join(", ");
```

### Verificación

Después del cambio, recargar la extensión y abrir el panel. Al escanear una página con
un campo ProseMirror, debe aparecer en la sección correspondiente del mapa DOM.

---

## Cambio 2 — Hacer que `isVisibleElement` acepte elementos `contenteditable`

### Ubicación exacta

Buscar la función `isVisibleElement(el)`. Actualmente comienza así:

```js
function isVisibleElement(el) {
    // Los elementos de media son siempre válidos aunque sean "invisibles"
    if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') return true;

    // Aceptar si tiene dimensiones directas
    if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
    // ...
```

### Acción

Agregar un bloque de verificación para `contenteditable` y `role="textbox"` **inmediatamente
después** del bloque de `AUDIO/VIDEO` y **antes** del check de `offsetWidth`:

```js
    // Aceptar editores enriquecidos (ProseMirror, contenteditable) aunque offsetWidth sea 0
    if (el.isContentEditable === true) return true;
    if (el.getAttribute('role') === 'textbox') return true;
```

### Resultado esperado tras el cambio

```js
function isVisibleElement(el) {
    // Los elementos de media son siempre válidos aunque sean "invisibles"
    if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') return true;

    // Aceptar editores enriquecidos (ProseMirror, contenteditable) aunque offsetWidth sea 0
    if (el.isContentEditable === true) return true;           // ← NUEVO
    if (el.getAttribute('role') === 'textbox') return true;   // ← NUEVO

    // Aceptar si tiene dimensiones directas
    if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;

    // Aceptar si está dentro de un overlay/popover activo
    const overlay = el.closest(
        '.cdk-overlay-pane, [popover], .cdk-overlay-container, ' +
        '.mat-mdc-select-panel, .mat-mdc-autocomplete-panel, ' +
        '.dropdown-menu.show, .popover.show, .modal.show'
    );
    if (overlay) return true;

    // Verificar computed style
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    // Aceptar elementos con aria-selected o aria-expanded
    if (el.hasAttribute('aria-selected') || el.hasAttribute('aria-expanded')) return true;

    return false;
}
```

### Verificación

El campo ProseMirror ya no debe ser filtrado silenciosamente en `getSemanticMap`.
Debe aparecer listado bajo el contexto `"Cuerpo Principal"` o `"Formulario"`.

---

## Cambio 3 — Hacer que `insertTextIntoElement` funcione con ProseMirror

### Contexto

ProseMirror gestiona su propio estado interno y **no reacciona** a
`document.execCommand('insertText')` de forma fiable. El enfoque correcto es:

1. Enfocar el elemento explícitamente.
2. Colocar el cursor al final del contenido existente mediante la Selection API.
3. Despachar un `InputEvent` de tipo `insertText` con `beforeinput` (que ProseMirror sí escucha).
4. Llamar a `execCommand` como fallback posterior.

### Ubicación exacta

Buscar la función `insertTextIntoElement(el, text)`. Actualmente comienza así:

```js
function insertTextIntoElement(el, text) {
    el.focus({ preventScroll: false });

    let success = false;
    try {
        success = document.execCommand('insertText', false, text);
    } catch (e) { }
    // ...
```

### Acción

Reemplazar **el cuerpo completo** de la función con la versión corregida:

```js
function insertTextIntoElement(el, text) {
    el.focus({ preventScroll: false });

    let success = false;

    // --- Rama especial para editores contenteditable (ProseMirror, Quill, etc.) ---
    if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
        // 1. Mover el cursor al final del contenido actual
        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false); // colapsar al final
            selection.removeAllRanges();
            selection.addRange(range);
        }

        // 2. Despachar beforeinput (ProseMirror lo intercepta para actualizar su estado)
        const beforeInputEvt = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
        });
        el.dispatchEvent(beforeInputEvt);

        // 3. Intentar execCommand (funciona en la mayoría de navegadores modernos)
        try {
            success = document.execCommand('insertText', false, text);
        } catch (e) { }

        // 4. Fallback: inserción directa en el nodo de texto si execCommand falló
        if (!success) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
                success = true;
            } else {
                el.innerText = (el.innerText || '') + text;
                success = true;
            }
        }

        // 5. Notificar a frameworks reactivos (React, Angular, Vue)
        if (success) {
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return success;
    }

    // --- Rama original para input / textarea ---
    try {
        success = document.execCommand('insertText', false, text);
    } catch (e) { }

    if (!success) {
        if (typeof el.setRangeText === 'function' && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            el.setRangeText(text, start, end, 'end');
            success = true;
        } else if (typeof el.value !== 'undefined') {
            el.value = `${el.value || ""}${text}`;
            success = true;
        } else if (el.isContentEditable) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                el.innerText = `${el.innerText || ""}${text}`;
            }
            success = true;
        }
    }

    if (success) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return success;
}
```

### Verificación

Usar la acción "Pegar texto" del panel con un texto de prueba mientras el campo
"Ask anything" está en foco. El texto debe aparecer en el editor sin borrar el contenido
previo y sin que el campo quede en un estado inconsistente.

---

## Cambio 4 — Mejorar la descripción del campo en `getSemanticMap` (complementario)

Este cambio es opcional pero mejora la legibilidad del mapa DOM para campos ProseMirror.

### Ubicación exacta

Dentro de `getSemanticMap()`, en el bloque `else` que construye `elementData` para
elementos que no son `AUDIO`/`VIDEO`:

```js
        } else {
            elementData = {
                aiRef: refId,
                tagName: el.tagName.toLowerCase(),
                type: el.type || 'clickable',
                text: (el.innerText || el.placeholder || el.value || el.getAttribute('aria-label') || "Elemento")
                    .replace(/\s+/g, ' ').trim().slice(0, 50),
                selector: generateBestSelector(el),
                locator: buildStableLocator(el)
            };
        }
```

### Acción

Reemplazar ese bloque `else` con la versión extendida:

```js
        } else {
            // Detectar tipo real del elemento
            const isEditor = el.isContentEditable || el.getAttribute('role') === 'textbox';
            const elementType = isEditor ? 'editable'
                : el.type || 'clickable';

            // Para editores contenteditable, usar aria-label o placeholder como texto descriptivo
            const elementText = isEditor
                ? (el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
                   el.getAttribute('data-placeholder') || el.innerText || 'Campo de texto')
                      .replace(/\s+/g, ' ').trim().slice(0, 50)
                : (el.innerText || el.placeholder || el.value || el.getAttribute('aria-label') || 'Elemento')
                      .replace(/\s+/g, ' ').trim().slice(0, 50);

            elementData = {
                aiRef: refId,
                tagName: el.tagName.toLowerCase(),
                type: elementType,
                text: elementText,
                selector: generateBestSelector(el),
                locator: buildStableLocator(el),
                isEditable: isEditor   // flag extra para uso en sidepanel si se necesita
            };
        }
```

---

## Orden de aplicación de los cambios

```
1 → INTERACTIVE_QUERY   (más seguro, solo añade selectores)
2 → isVisibleElement    (añade dos líneas, no rompe lógica existente)
3 → insertTextIntoElement  (reemplaza la función completa)
4 → getSemanticMap (opcional, solo mejora la descripción visual)
```

Aplicar en ese orden permite verificar cada cambio de forma aislada antes de continuar.

---

## Prueba de regresión sugerida tras los cambios

| Escenario | Resultado esperado |
|-----------|-------------------|
| Escanear Claude.ai con el panel abierto | El campo "Ask anything" aparece en el mapa DOM |
| Hacer clic en el campo desde el botón ▶ del panel | El campo recibe foco correctamente |
| Usar "Pegar texto" con el campo en foco | El texto aparece en el editor sin errores |
| Grabar un Journey que incluya el campo | El paso se guarda con `locator` y `selector` correctos |
| Reproducir el Journey grabado | El campo es encontrado y el texto es insertado |
| Usar en un `<textarea>` normal | Sigue funcionando igual que antes (sin regresión) |
| Usar en un `<input type="text">` | Sigue funcionando igual que antes (sin regresión) |

---

## Notas para el agente

- **No modificar** `background.js`, `sidepanel.js`, `sidepanel.html` ni `manifest.json`.
- Los cambios 1, 2 y 4 son **aditivos** (solo agregan código). El cambio 3 es un
  **reemplazo completo** de la función `insertTextIntoElement`.
- Después de aplicar los cambios, recargar la extensión en `chrome://extensions`
  antes de probar.
- Si ProseMirror sigue ignorando el texto en algún caso específico, el siguiente paso
  sería despachar un `KeyboardEvent` sintético (`keydown` + `keypress` + `keyup`)
  después del `InputEvent`, pero esto no debería ser necesario con los cambios actuales.
