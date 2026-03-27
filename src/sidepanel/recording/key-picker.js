import { refs } from '../dom-refs.js';
import * as state from '../state.js';
import { updateRecStepCount } from './controls.js';

export const KEY_GROUPS = [
    {
        label: 'Más usadas',
        keys: [
            { label: 'Enter', key: 'Enter', code: 'Enter', keyCode: 13 },
            { label: 'Tab', key: 'Tab', code: 'Tab', keyCode: 9 },
            { label: 'Esc', key: 'Escape', code: 'Escape', keyCode: 27 },
            { label: 'Espacio', key: ' ', code: 'Space', keyCode: 32 },
            { label: '⌫ Backspace', key: 'Backspace', code: 'Backspace', keyCode: 8 },
            { label: 'Delete', key: 'Delete', code: 'Delete', keyCode: 46 }
        ]
    },
    {
        label: 'Navegación',
        keys: [
            { label: '↑', key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
            { label: '↓', key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
            { label: '←', key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
            { label: '→', key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
            { label: 'Home', key: 'Home', code: 'Home', keyCode: 36 },
            { label: 'End', key: 'End', code: 'End', keyCode: 35 },
            { label: 'PgUp', key: 'PageUp', code: 'PageUp', keyCode: 33 },
            { label: 'PgDn', key: 'PageDown', code: 'PageDown', keyCode: 34 }
        ]
    },
    {
        label: 'Modificadores',
        keys: [
            { label: 'Ctrl+A', key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true },
            { label: 'Ctrl+C', key: 'c', code: 'KeyC', keyCode: 67, ctrlKey: true },
            { label: 'Ctrl+X', key: 'x', code: 'KeyX', keyCode: 88, ctrlKey: true },
            { label: 'Ctrl+V', key: 'v', code: 'KeyV', keyCode: 86, ctrlKey: true },
            { label: 'Ctrl+Z', key: 'z', code: 'KeyZ', keyCode: 90, ctrlKey: true },
            { label: 'Ctrl+Y', key: 'y', code: 'KeyY', keyCode: 89, ctrlKey: true },
            { label: 'Ctrl+Enter', key: 'Enter', code: 'Enter', keyCode: 13, ctrlKey: true },
            { label: 'Shift+Enter', key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: true },
            { label: 'Shift+Tab', key: 'Tab', code: 'Tab', keyCode: 9, shiftKey: true },
            { label: 'Ctrl+Shift+Enter', key: 'Enter', code: 'Enter', keyCode: 13, ctrlKey: true, shiftKey: true }
        ]
    },
    {
        label: 'Función',
        keys: [
            { label: 'F1', key: 'F1', code: 'F1', keyCode: 112 },
            { label: 'F2', key: 'F2', code: 'F2', keyCode: 113 },
            { label: 'F5', key: 'F5', code: 'F5', keyCode: 116 },
            { label: 'F12', key: 'F12', code: 'F12', keyCode: 123 }
        ]
    }
];

export function showKeyPicker() {
    refs.keyPickerList.innerHTML = '';
    refs.textPickerPanel.style.display = 'none';

    KEY_GROUPS.forEach((group) => {
        const label = document.createElement('div');
        label.className = 'key-group-label';
        label.textContent = group.label;
        refs.keyPickerList.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'key-grid';

        group.keys.forEach((keyDef) => {
            const chip = document.createElement('button');
            chip.className = 'key-chip';
            chip.textContent = keyDef.label;
            chip.title = keyDef.key;
            chip.addEventListener('click', () => {
                state.addRecordedStep({
                    stepType: 'key_press',
                    key: keyDef.key,
                    code: keyDef.code,
                    keyCode: keyDef.keyCode,
                    ctrlKey: keyDef.ctrlKey || false,
                    shiftKey: keyDef.shiftKey || false,
                    altKey: keyDef.altKey || false,
                    label: keyDef.label
                });
                updateRecStepCount();
                refs.keyPickerPanel.style.display = 'none';
            });
            grid.appendChild(chip);
        });

        refs.keyPickerList.appendChild(grid);
    });

    refs.keyPickerPanel.style.display = 'flex';
}

export function initKeyPicker() {
    refs.btnAddKeyStep.addEventListener('click', () => {
        if (!state.isRecording) {
            return;
        }

        showKeyPicker();
    });

    refs.btnCloseKeyPicker.addEventListener('click', () => {
        refs.keyPickerPanel.style.display = 'none';
    });
}