import { refs } from './dom-refs.js';
import * as state from './state.js';

async function sendAudioMessage(payload) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, payload);
    }
}

export function bannerBtnStyle(color) {
    return `
        background:${color}; border:none; border-radius:6px;
        color:white; padding:5px 10px; cursor:pointer;
        font-size:11px; font-weight:700; white-space:nowrap;
    `;
}

export function showAudioBanner(audioInfo) {
    const old = document.getElementById('audioBanner');
    if (old) {
        old.remove();
    }

    const banner = document.createElement('div');
    banner.id = 'audioBanner';
    banner.style.cssText = `
        position: fixed; bottom: 0; left: 0; right: 0;
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        border-top: 2px solid #7c3aed;
        padding: 10px 12px;
        z-index: 9999;
        font-size: 11px;
        color: #f0f0f5;
        box-shadow: 0 -4px 20px rgba(124,58,237,0.3);
    `;

    const srcLabel = audioInfo.isBase64 ? 'base64/WAV'
        : audioInfo.isBlob ? 'blob audio'
            : (audioInfo.src || 'audio');

    banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:18px;">🎵</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:#c4b5fd;">Audio detectado</div>
                <div style="color:#a0a0b0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${srcLabel}
                    ${audioInfo.duration ? ` · ${Math.round(audioInfo.duration)}s` : ''}
                </div>
            </div>
            <button id="audioBannerPlay" style="${bannerBtnStyle('#10b981')}">▶ Play</button>
            <button id="audioBannerPause" style="${bannerBtnStyle('#f59e0b')}">⏸ Pause</button>
            <button id="audioBannerDl" style="${bannerBtnStyle('#3b82f6')}">⬇ Descargar</button>
            <button id="audioBannerClose" style="${bannerBtnStyle('#6b7280')}">✕</button>
        </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('audioBannerPlay').addEventListener('click', async () => {
        await sendAudioMessage({ action: 'CONTROL_AUDIO', command: 'play', aiRef: audioInfo.aiRef });
    });

    document.getElementById('audioBannerPause').addEventListener('click', async () => {
        await sendAudioMessage({ action: 'CONTROL_AUDIO', command: 'pause', aiRef: audioInfo.aiRef });
    });

    document.getElementById('audioBannerDl').addEventListener('click', async () => {
        await sendAudioMessage({ action: 'DOWNLOAD_AUDIO', aiRef: audioInfo.aiRef, filename: `audio_${Date.now()}.wav` });
    });

    document.getElementById('audioBannerClose').addEventListener('click', () => {
        banner.remove();
    });
}

export function refreshMapWithAudio(audioInfo) {
    let mediaSection = Array.from(refs.consoleLog.querySelectorAll('.section-header'))
        .find((header) => header.innerText.includes('Reproductor'));

    if (!mediaSection) {
        mediaSection = document.createElement('div');
        mediaSection.className = 'section-header';
        mediaSection.innerText = '🎵 Reproductor de Media';
        refs.consoleLog.insertBefore(mediaSection, refs.consoleLog.firstChild);
    }

    const existingItem = refs.consoleLog.querySelector(`[data-audio-ref="${audioInfo.aiRef}"]`);
    if (existingItem) {
        return;
    }

    const srcLabel = audioInfo.isBase64 ? '[base64 · WAV]'
        : audioInfo.isBlob ? '[blob audio]'
            : (audioInfo.src || '').slice(0, 50);

    const div = document.createElement('div');
    div.className = 'item';
    div.setAttribute('data-audio-ref', audioInfo.aiRef);
    div.style.background = 'rgba(124,58,237,0.08)';
    div.style.borderLeft = '3px solid #7c3aed';
    div.innerHTML = `
        <div class="item-info">
            <b>🎵 audio · ${srcLabel}</b>
            <span class="selector">audio[data-ai-ref="${audioInfo.aiRef}"]</span>
        </div>
        <div style="display:flex; gap:4px;">
            <button class="btn-audio-play btn-run" style="background:#10b981; width:auto; padding:0 8px; border-radius:4px;" data-ai-ref="${audioInfo.aiRef}" title="Play">▶</button>
            <button class="btn-audio-dl btn-run" style="background:#3b82f6; width:auto; padding:0 8px; border-radius:4px;" data-ai-ref="${audioInfo.aiRef}" title="Descargar">⬇</button>
        </div>
    `;

    mediaSection.insertAdjacentElement('afterend', div);

    div.querySelector('.btn-audio-play').addEventListener('click', async () => {
        await sendAudioMessage({ action: 'CONTROL_AUDIO', command: 'play', aiRef: audioInfo.aiRef });
    });

    div.querySelector('.btn-audio-dl').addEventListener('click', async () => {
        await sendAudioMessage({ action: 'DOWNLOAD_AUDIO', aiRef: audioInfo.aiRef, filename: `audio_${Date.now()}.wav` });
    });

    if (!state.lastAnalysisData) {
        return;
    }
}