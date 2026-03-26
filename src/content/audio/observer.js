import { triggerAutoAnalyzeAndSync } from '../auto-scan.js';

let audioObserver = null;

export function handleNewAudioElement(audioEl) {
    if (!audioEl.dataset.aiRef) {
        audioEl.dataset.aiRef = `ai-audio-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
    }

    const notifyWhenReady = () => {
        const src = audioEl.src || audioEl.currentSrc || '';
        const isBase64 = src.startsWith('data:audio');
        const isBlob = src.startsWith('blob:');
        const isUrl = src.startsWith('http');

        chrome.runtime.sendMessage({
            action: 'AUDIO_DETECTED',
            aiRef: audioEl.dataset.aiRef,
            src: isBase64 ? '[base64 audio]' : src,
            srcFull: src,
            isBase64,
            isBlob,
            isUrl,
            duration: audioEl.duration || null,
            mimeType: src.split(';')[0].replace('data:', '') || 'audio/wav'
        }).catch(() => {
        });
    };

    if (audioEl.src || audioEl.currentSrc) {
        notifyWhenReady();
    } else {
        audioEl.addEventListener('loadedmetadata', notifyWhenReady, { once: true });
        setTimeout(notifyWhenReady, 800);
    }

    triggerAutoAnalyzeAndSync();
}

export function startAudioObserver() {
    if (audioObserver) {
        return;
    }

    audioObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;

                if (node.tagName === 'AUDIO') {
                    handleNewAudioElement(node);
                    continue;
                }

                const audioInside = node.querySelector?.('audio');
                if (audioInside) {
                    handleNewAudioElement(audioInside);
                }
            }
        }
    });

    audioObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}