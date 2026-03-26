import { refs } from '../dom-refs.js';
import * as state from '../state.js';
import { updateRecStepCount } from './controls.js';

export function showTextPicker() {
    refs.textPickerList.innerHTML = '';

    if (state.savedTexts.length === 0) {
        refs.textPickerList.innerHTML = '<div class="text-picker-empty">No hay textos guardados.<br>Ve a la pestaña Textos para crear uno.</div>';
    } else {
        state.savedTexts.forEach((txt) => {
            const item = document.createElement('div');
            const preview = txt.content.replace(/\s+/g, ' ').trim().slice(0, 50);
            item.className = 'text-picker-item';
            item.innerHTML = `<b>${txt.name}</b><span>${preview}${txt.content.length > 50 ? '...' : ''}</span>`;
            item.addEventListener('click', () => {
                state.addRecordedStep({
                    stepType: 'paste_text',
                    textId: txt.id,
                    textName: txt.name
                });
                updateRecStepCount();
                refs.textPickerPanel.style.display = 'none';
            });
            refs.textPickerList.appendChild(item);
        });
    }

    refs.textPickerPanel.style.display = 'flex';
}

export function initTextPicker() {
    refs.btnAddTextStep.addEventListener('click', () => {
        if (!state.isRecording) {
            return;
        }
        showTextPicker();
    });

    refs.btnCloseTextPicker.addEventListener('click', () => {
        refs.textPickerPanel.style.display = 'none';
    });
}