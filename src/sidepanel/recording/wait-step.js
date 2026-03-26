import { refs } from '../dom-refs.js';
import * as state from '../state.js';
import { updateRecStepCount } from './controls.js';

export function initWaitStep() {
    refs.btnAddWaitStep.addEventListener('click', () => {
        if (!state.isRecording) {
            return;
        }

        const secondsStr = prompt('¿Cuántos segundos deseas esperar?', '5');
        if (!secondsStr) {
            return;
        }

        const seconds = parseFloat(secondsStr);
        if (Number.isNaN(seconds) || seconds <= 0) {
            alert('Por favor ingresa un número válido mayor a 0.');
            return;
        }

        state.addRecordedStep({
            stepType: 'wait',
            durationMs: seconds * 1000,
            label: `Esperar ${seconds} segundos`
        });
        updateRecStepCount();
    });
}