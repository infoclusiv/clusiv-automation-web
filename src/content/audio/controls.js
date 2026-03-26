function getAudioElement(aiRef) {
    return aiRef
        ? document.querySelector(`[data-ai-ref="${aiRef}"]`)
        : document.querySelector('audio');
}

export async function handleAudioControl(request) {
    const audioEl = getAudioElement(request.aiRef);

    if (!audioEl) {
        return { status: 'not_found', message: 'No hay elemento <audio> en el DOM' };
    }

    if (request.command === 'play') {
        try {
            await audioEl.play();
            return { status: 'playing' };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    if (request.command === 'pause') {
        audioEl.pause();
        return { status: 'paused', currentTime: audioEl.currentTime };
    }

    if (request.command === 'stop') {
        audioEl.pause();
        audioEl.currentTime = 0;
        return { status: 'stopped' };
    }

    if (request.command === 'get_info') {
        const src = audioEl.src || audioEl.currentSrc || '';
        return {
            status: 'ok',
            aiRef: audioEl.dataset.aiRef,
            duration: audioEl.duration,
            currentTime: audioEl.currentTime,
            paused: audioEl.paused,
            ended: audioEl.ended,
            isBase64: src.startsWith('data:audio'),
            isBlob: src.startsWith('blob:'),
            mimeType: src.startsWith('data:') ? src.split(';')[0].replace('data:', '') : 'unknown'
        };
    }

    if (request.command === 'wait_end') {
        if (audioEl.ended) {
            return { status: 'already_ended' };
        }

        return new Promise((resolve) => {
            audioEl.addEventListener('ended', () => {
                resolve({ status: 'ended' });
            }, { once: true });
            setTimeout(() => resolve({ status: 'timeout' }), 300000);
        });
    }

    return { status: 'error', message: 'Comando de audio no soportado.' };
}