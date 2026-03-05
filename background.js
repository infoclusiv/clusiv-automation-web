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

            // Python ordena ejecutar un Journey específico 
            if (msg.action === "RUN_JOURNEY" && msg.journey_id) { 
                executeJourney(msg.journey_id); 
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
 */ 
async function executeJourney(journeyId) { 
    chrome.storage.local.get(['savedJourneys'], async (res) => { 
        const journeys = res.savedJourneys ||[]; 
        const journey = journeys.find(j => j.id === journeyId); 

        if (!journey) { 
            sendStatusToPython("error", `Journey ID '${journeyId}' no encontrado en la extensión.`); 
            return; 
        } 

        sendStatusToPython("started", `Iniciando secuencia: ${journey.name} (${journey.steps.length} pasos)`); 

        // Obtener la pestaña activa 
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); 
        if (!tab) { 
            sendStatusToPython("error", "No hay una pestaña activa para ejecutar los clics."); 
            return; 
        } 

        // Iterar sobre los pasos del journey 
        for (let i = 0; i < journey.steps.length; i++) { 
            const step = journey.steps[i]; 
            
            sendStatusToPython("progress", `Ejecutando paso ${i + 1}/${journey.steps.length}: ${step.text}`); 
            
            try { 
                // Enviar comando al content.js 
                const response = await chrome.tabs.sendMessage(tab.id, { 
                    action: "SIMULATE_CLICK", 
                    id: step.aiRef, 
                    selector: step.selector, 
                    text: step.text 
                }); 

                if (response && response.status === "not_found") { 
                    sendStatusToPython("error", `Fallo en el paso ${i + 1}: Elemento no encontrado en el DOM.`); 
                    return; // Detener ejecución si falla un paso 
                } 
            } catch (e) { 
                sendStatusToPython("error", `Fallo de conexión con la pestaña en el paso ${i + 1}. ¿La página está recargando?`); 
                return; 
            } 
            
            // Pausa de 1.5 segundos entre clics para permitir animaciones/cargas de red 
            await new Promise(resolve => setTimeout(resolve, 1500)); 
        } 

        sendStatusToPython("completed", `✅ Secuencia finalizada: ${journey.name}`); 
    }); 
} 

/** 
 * Función auxiliar para enviar estados a Python 
 */ 
function sendStatusToPython(statusType, messageStr) { 
    if (ws && ws.readyState === WebSocket.OPEN) { 
        ws.send(JSON.stringify({ 
            action: "JOURNEY_STATUS", 
            status: statusType, 
            message: messageStr 
        })); 
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
