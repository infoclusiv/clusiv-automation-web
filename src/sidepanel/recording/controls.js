import { refs } from '../dom-refs.js';
import * as state from '../state.js';
import { saveJourneys } from '../journeys/persistence.js';

export function updateRecStepCount() {
    refs.recStepCount.textContent = `${state.recordedSteps.length} paso${state.recordedSteps.length !== 1 ? 's' : ''}`;
    refs.recStepCount.classList.toggle('has-steps', state.recordedSteps.length > 0);
}

export async function startRecording() {
    state.setIsRecording(true);
    state.setRecordedSteps([]);
    updateRecStepCount();
    refs.btnRecord.textContent = '⏹ Detener';
    refs.btnRecord.classList.add('recording');
    refs.recordingBar.classList.add('is-recording');
    refs.btnAddTextStep.classList.add('visible');
    refs.btnAddKeyStep.classList.add('visible');
    refs.btnAddWaitStep.classList.add('visible');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'START_RECORDING' }).catch(() => {
        });
    }
}

export async function stopRecording() {
    state.setIsRecording(false);
    refs.btnRecord.textContent = '⏺ Grabar';
    refs.btnRecord.classList.remove('recording');
    refs.recordingBar.classList.remove('is-recording');
    refs.btnAddTextStep.classList.remove('visible');
    refs.btnAddKeyStep.classList.remove('visible');
    refs.btnAddWaitStep.classList.remove('visible');
    refs.textPickerPanel.style.display = 'none';
    refs.keyPickerPanel.style.display = 'none';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'STOP_RECORDING' }).catch(() => {
        });
    }

    if (state.recordedSteps.length === 0) {
        alert('No se grabaron pasos.');
        return;
    }

    const name = prompt(`Guardar secuencia (${state.recordedSteps.length} pasos).\nIngresa un nombre:`);
    if (!name || !name.trim()) {
        alert('Grabación descartada.');
        state.setRecordedSteps([]);
        updateRecStepCount();
        return;
    }

    const journey = {
        id: `j-${Date.now()}`,
        name: name.trim(),
        steps: [...state.recordedSteps],
        createdAt: new Date().toLocaleString()
    };

    state.setSavedJourneys([...state.savedJourneys, journey]);
    saveJourneys();
    state.setRecordedSteps([]);
    updateRecStepCount();
    alert(`✅ Secuencia "${journey.name}" guardada con ${journey.steps.length} pasos.`);
}

export function initRecordingControls() {
    refs.btnRecord.addEventListener('click', () => {
        if (state.isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
}