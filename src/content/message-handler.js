import { handleAudioControl } from './audio/controls.js';
import { downloadAudioFromPage, getAudioSource, waitForAudioElement } from './audio/download.js';
import { startAutoScan, stopAutoScan } from './auto-scan.js';
import { getSemanticMap } from './dom/semantic-map.js';
import { clickWithRetries, simulateHumanClick } from './interactions/click.js';
import { simulateKeyPress } from './interactions/keyboard.js';
import { pasteTextWithRetries } from './interactions/paste.js';
import { setRecordingMode } from './recording.js';
import { validateExecutionStep } from './validation.js';

export function registerContentMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'ANALYZE_DOM') {
            sendResponse({ map: getSemanticMap() });
        }

        if (request.action === 'START_AUTO_SCAN') {
            sendResponse(startAutoScan());
        }

        if (request.action === 'STOP_AUTO_SCAN') {
            sendResponse(stopAutoScan());
        }

        if (request.action === 'START_RECORDING') {
            setRecordingMode(true);
            sendResponse({ status: 'recording_started' });
        }

        if (request.action === 'STOP_RECORDING') {
            setRecordingMode(false);
            sendResponse({ status: 'recording_stopped' });
        }

        if (request.action === 'SIMULATE_CLICK') {
            clickWithRetries(request)
                .then((element) => {
                    if (element) {
                        simulateHumanClick(element);
                        sendResponse({ status: 'clicked' });
                    } else {
                        sendResponse({ status: 'not_found' });
                    }
                })
                .catch(() => sendResponse({ status: 'not_found' }));
        }

        if (request.action === 'PASTE_TEXT') {
            pasteTextWithRetries(request.text).then(sendResponse);
        }

        if (request.action === 'SIMULATE_KEY') {
            sendResponse(simulateKeyPress({
                key: request.key,
                code: request.code,
                keyCode: request.keyCode,
                ctrlKey: request.ctrlKey || false,
                shiftKey: request.shiftKey || false,
                altKey: request.altKey || false
            }));
        }

        if (request.action === 'VALIDATE_EXECUTION_PLAN') {
            const steps = Array.isArray(request.steps) ? request.steps : [];
            const validations = steps.map((step, index) => ({
                stepIndex: typeof step.stepIndex === 'number' ? step.stepIndex : index,
                stepType: step.stepType || 'click',
                ...validateExecutionStep(step)
            }));
            const hasErrors = validations.some((validation) => validation.status !== 'ok');

            sendResponse({
                status: hasErrors ? 'error' : 'ok',
                siteReady: !hasErrors,
                page: {
                    url: window.location.href,
                    title: document.title
                },
                steps: validations
            });
            return true;
        }

        if (request.action === 'CONTROL_AUDIO') {
            handleAudioControl(request).then(sendResponse);
            return true;
        }

        if (request.action === 'DOWNLOAD_AUDIO') {
            sendResponse(downloadAudioFromPage(request.aiRef, request.filename));
            return true;
        }

        if (request.action === 'WAIT_FOR_AUDIO') {
            waitForAudioElement(request.timeoutMs || 15000).then(sendResponse);
            return true;
        }

        if (request.action === 'GET_AUDIO_SRC') {
            sendResponse(getAudioSource(request.aiRef));
            return true;
        }

        return true;
    });
}