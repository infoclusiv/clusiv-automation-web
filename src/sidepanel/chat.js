import { refs } from './dom-refs.js';
import * as state from './state.js';

export function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerText = text;
    refs.chatBox.appendChild(div);
    refs.chatBox.scrollTop = refs.chatBox.scrollHeight;
}

export function addAiMessage(text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.id = id;
    div.innerText = text;
    refs.chatBox.appendChild(div);
    refs.chatBox.scrollTop = refs.chatBox.scrollHeight;
    return id;
}

export async function callOpenRouter(userText) {
    const storage = await chrome.storage.local.get(['apiKey', 'modelId']);
    if (!storage.apiKey) {
        return '❌ Configura la API Key.';
    }

    const contextStr = JSON.stringify(state.lastAnalysisData || {}).slice(0, 4000);
    const messages = [
        { role: 'system', content: `Eres un experto QA. Contexto DOM actual: ${contextStr}` },
        ...state.chatHistory.slice(-4),
        { role: 'user', content: userText }
    ];

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${storage.apiKey}`,
                'X-Title': 'Web Analyst Pro'
            },
            body: JSON.stringify({ model: storage.modelId || 'google/gemini-2.0-flash-001', messages })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'Error en respuesta.';
    } catch {
        return '❌ Error de conexión.';
    }
}

export async function handleSendMessage() {
    const text = refs.chatInput.value.trim();
    if (!text) {
        return;
    }

    addUserMessage(text);
    refs.chatInput.value = '';

    const loadingId = addAiMessage('⏳ Procesando...');
    const aiResponse = await callOpenRouter(text);
    const msgDiv = document.getElementById(loadingId);
    if (msgDiv) {
        msgDiv.innerText = aiResponse;
    }

    state.appendChatHistory({ role: 'user', content: text }, { role: 'assistant', content: aiResponse });
}

export function initChat() {
    refs.btnSend.addEventListener('click', handleSendMessage);
    refs.chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    });
}