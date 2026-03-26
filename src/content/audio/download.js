function getAudioElement(aiRef) {
    return aiRef
        ? document.querySelector(`[data-ai-ref="${aiRef}"]`)
        : document.querySelector('audio');
}

export function downloadAudioFromPage(aiRef, filename) {
    const audioEl = getAudioElement(aiRef);

    if (!audioEl) {
        return { status: 'not_found', message: 'No se encontró el elemento <audio>' };
    }

    const src = audioEl.src || audioEl.currentSrc;
    if (!src) {
        return { status: 'no_src', message: 'El elemento audio no tiene src todavía' };
    }

    try {
        const anchor = document.createElement('a');
        anchor.href = src;
        anchor.download = filename || 'audio_generado.wav';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        return { status: 'download_started', filename: anchor.download };
    } catch (error) {
        return { status: 'error', message: error.message };
    }
}

export async function waitForAudioElement(timeoutMs = 15000) {
    const existing = document.querySelector('audio');
    if (existing && (existing.src || existing.currentSrc)) {
        return { status: 'found', aiRef: existing.dataset.aiRef, src: existing.src };
    }

    return new Promise((resolve) => {
        const obs = new MutationObserver(() => {
            const el = document.querySelector('audio');
            if (el) {
                const checkSrc = () => {
                    const src = el.src || el.currentSrc;
                    if (src) {
                        clearTimeout(deadline);
                        obs.disconnect();
                        resolve({ status: 'found', aiRef: el.dataset.aiRef, src });
                    }
                };
                checkSrc();
                if (!el.src) {
                    el.addEventListener('loadedmetadata', checkSrc, { once: true });
                }
            }
        });

        const deadline = setTimeout(() => {
            obs.disconnect();
            resolve({ status: 'timeout', message: 'Audio no apareció en el tiempo esperado' });
        }, timeoutMs);

        obs.observe(document.body, { childList: true, subtree: true });
    });
}

export function getAudioSource(aiRef) {
    const audioEl = getAudioElement(aiRef);

    if (!audioEl) {
        return { status: 'not_found' };
    }

    const src = audioEl.src || audioEl.currentSrc || '';
    return {
        status: 'ok',
        src,
        isBase64: src.startsWith('data:audio'),
        isBlob: src.startsWith('blob:'),
        aiRef: audioEl.dataset.aiRef,
        duration: audioEl.duration
    };
}