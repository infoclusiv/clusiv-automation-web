// Configuración para abrir el panel lateral al hacer clic en el icono 
chrome.sidePanel 
  .setPanelBehavior({ openPanelOnActionClick: true }) 
  .catch((error) => console.error(error)); 

// ========================================== 
// --- CLIENTE WEBSOCKET (CONEXIÓN A PYTHON) --- 
// ========================================== 
let ws = null; 
let isConnecting = false; 
const WS_URL = 'ws://localhost:8765'; 

function connectWebSocket() { 
    if (ws || isConnecting) return; 
    isConnecting = true; 
    
    console.log(`Intentando conectar a ${WS_URL}...`); 
    ws = new WebSocket(WS_URL); 

    ws.onopen = () => { 
        console.log("🟢 Conectado exitosamente al Orquestador Python."); 
        isConnecting = false; 
        // Al conectar, enviamos inmediatamente la lista de journeys disponibles 
        sendJourneysToPython(); 
    }; 

    ws.onmessage = async (event) => { 
        try { 
            const msg = JSON.parse(event.data); 

            // Python solicita actualizar la lista de Journeys 
            if (msg.action === "GET_JOURNEYS") { 
                sendJourneysToPython(); 
            } 

            // Python ordena ejecutar un Journey específico (y opcionalmente pegar texto al final) 
            if (msg.action === "RUN_JOURNEY" && msg.journey_id) { 
                executeJourney(msg.journey_id, msg.paste_text_at_end); 
            } 

            // Python manda pegar directamente el texto (Botón Manual) 
            if (msg.action === "PASTE_TEXT_NOW" && msg.text) { 
                chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => { 
                    if (tabs.length === 0) { 
                        sendStatusToPython("error", "No hay pestaña activa para pegar el texto."); 
                        return;
                    }

                    try {
                        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: "PASTE_TEXT", text: msg.text });
                        if (!response || response.status !== "pasted") {
                            const errorMessage = response?.message || "El contenido no pudo insertarse en el campo objetivo.";
                            sendStatusToPython("error", `Fallo al pegar: ${errorMessage}`);
                            return;
                        }

                        sendStatusToPython("paste_completed", "✅ Script pegado exitosamente en el campo activo.");
                    } catch (error) {
                        console.error("Error enviando PASTE_TEXT a la pestaña activa:", error);
                        sendStatusToPython("error", "Error de conexión al intentar pegar el texto.");
                    }
                }); 
            } 
        } catch (error) { 
            console.error("Error procesando mensaje del WS:", error); 
        } 
    }; 

    ws.onclose = () => { 
        console.log("🔴 Desconectado del servidor Python. Reintentando en 3s..."); 
        ws = null; 
        isConnecting = false; 
        // Bucle de reconexión automática 
        setTimeout(connectWebSocket, 3000); 
    }; 

    ws.onerror = (error) => { 
        console.error("⚠️ Error en WebSocket:", error); 
        if (ws) ws.close(); 
    }; 
} 

// ========================================== 
// --- FUNCIONES DE COMUNICACIÓN Y EJECUCIÓN --- 
// ========================================== 

/** 
 * Lee los Journeys del storage local y los envía al servidor Python 
 */ 
function sendJourneysToPython() { 
    chrome.storage.local.get(['savedJourneys'], (res) => { 
        if (ws && ws.readyState === WebSocket.OPEN) { 
            ws.send(JSON.stringify({ 
                action: "JOURNEYS_LIST", 
                data: res.savedJourneys ||[] 
            })); 
        } 
    }); 
} 

/** 
 * Busca un Journey por ID y ordena al content.js ejecutar cada paso 
 * @param {string} journeyId - El ID del journey a ejecutar 
 * @param {string} textToPaste - Texto opcional para pegar al final del journey 
 */ 
async function executeJourney(journeyId, textToPaste) { 
    chrome.storage.local.get(['savedJourneys'], async (res) => { 
        const journeys = res.savedJourneys ||[]; 
        const journey = journeys.find(j => j.id === journeyId); 

        if (!journey) { 
            sendStatusToPython("error", `Journey ID '${journeyId}' no encontrado en la extensión.`, journeyId); 
            return; 
        } 

        if (!sendStatusToPython("started", `Iniciando secuencia: ${journey.name} (${journey.steps.length} pasos)`, journeyId)) {
            return;
        }

        // Obtener la pestaña activa 
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); 
        if (!tab) { 
            sendStatusToPython("error", "No hay una pestaña activa para ejecutar los clics.", journeyId); 
            return; 
        } 

        // Iterar sobre los pasos del journey 
        for (let i = 0; i < journey.steps.length; i++) { 
            const step = journey.steps[i]; 
            
            if (!sendStatusToPython("progress", `Ejecutando paso ${i + 1}/${journey.steps.length}: ${step.text}`, journeyId)) {
                return;
            }
            
            try { 
                // Enviar comando al content.js 
                const response = await chrome.tabs.sendMessage(tab.id, { 
                    action: "SIMULATE_CLICK", 
                    id: step.aiRef, 
                    selector: step.selector, 
                    text: step.text,
                    locator: step.locator || null
                }); 

                if (response && response.status === "not_found") { 
                    sendStatusToPython("error", `Fallo en el paso ${i + 1}: Elemento no encontrado en el DOM.`, journeyId); 
                    return; // Detener ejecución si falla un paso 
                } 
            } catch (e) { 
                sendStatusToPython("error", `Fallo de conexión con la pestaña en el paso ${i + 1}. ¿La página está recargando?`, journeyId); 
                return; 
            } 
            
            // Pausa de 1.5 segundos entre clics para permitir animaciones/cargas de red 
            await new Promise(resolve => setTimeout(resolve, 1500)); 
        } 

        // --- NUEVA LÓGICA: Pegar texto al finalizar la secuencia de clics --- 
        if (textToPaste) { 
            if (!sendStatusToPython("progress", "Paso Final: Insertando contenido de script.txt...", journeyId)) {
                return;
            }
            try { 
                const response = await chrome.tabs.sendMessage(tab.id, { 
                    action: "PASTE_TEXT", 
                    text: textToPaste 
                }); 
                if (!response || response.status !== "pasted") {
                    const errorMessage = response?.message || "El contenido no pudo insertarse en el campo objetivo.";
                    sendStatusToPython("error", `Fallo al pegar: ${errorMessage}`, journeyId);
                    return; 
                } 
                if (!sendStatusToPython("paste_completed", "Script pegado correctamente", journeyId)) {
                    return;
                }
            } catch (e) { 
                sendStatusToPython("error", "Error de conexión al intentar inyectar el script.", journeyId); 
                return; 
            } 
            await new Promise(resolve => setTimeout(resolve, 1000)); 
        } 

        sendStatusToPython("completed", `✅ Secuencia finalizada: ${journey.name}`, journeyId); 
    }); 
} 

/** 
 * Función auxiliar para enviar estados a Python 
 */ 
function sendStatusToPython(statusType, messageStr, journeyId = null) { 
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error("No se pudo enviar el estado al backend: WebSocket no disponible.", { statusType, journeyId });
        return false;
    }

    const payload = { 
        action: "JOURNEY_STATUS", 
        status: statusType, 
        message: messageStr 
    };

    if (journeyId) {
        payload.journey_id = journeyId;
    }

    try {
        ws.send(JSON.stringify(payload));
        return true;
    } catch (error) {
        console.error("No se pudo enviar el estado al backend.", { statusType, journeyId, error });
        return false;
    }
} 

// ========================================== 
// --- INICIALIZACIÓN --- 
// ========================================== 

// Mantener vivo el Service Worker respondiendo a eventos de instalación/activación 
chrome.runtime.onInstalled.addListener(() => { 
    connectWebSocket(); 
}); 

chrome.runtime.onStartup.addListener(() => { 
    connectWebSocket(); 
}); 

// Iniciar conexión inmediatamente cuando se despierte el background script 
connectWebSocket(); 

// ==========================================
// --- HANDLER DE MENSAJES INTERNOS (SIDEPANEL → BACKGROUND) ---
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_ACTIVE_TAB_CONTEXT") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) {
                sendResponse({ url: "unknown", origin: "unknown", page_title: "unknown" });
                return;
            }

            const tab = tabs[0];
            let origin = "unknown";

            try {
                origin = new URL(tab.url).origin;
            } catch (e) {
            }

            sendResponse({
                url: tab.url || "unknown",
                origin,
                page_title: tab.title || "unknown"
            });
        });

        return true;
    }
});
