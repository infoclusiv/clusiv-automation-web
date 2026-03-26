import { refs } from '../dom-refs.js';
import * as state from '../state.js';
import { saveTexts } from './persistence.js';

export function renderTexts() {
    refs.textsList.innerHTML = '';
    refs.textEditorPanel.style.display = 'none';
    state.setEditingTextId(null);
    refs.textNameInput.value = '';
    refs.textContentInput.value = '';

    if (state.savedTexts.length === 0) {
        refs.textsList.innerHTML = '<div class="journey-empty">No hay textos guardados.</div>';
        return;
    }

    state.savedTexts.forEach((txt) => {
        const div = document.createElement('div');
        const preview = txt.content.replace(/\s+/g, ' ').trim().slice(0, 60);
        div.className = 'text-item';
        div.innerHTML = `
            <div class="text-item-info">
                <b>${txt.name}</b>
                <span>${preview}${txt.content.length > 60 ? '...' : ''}</span>
            </div>
            <div class="text-item-actions">
                <button class="btn-edit-text" data-id="${txt.id}" title="Editar">✏</button>
                <button class="btn-delete-text" data-id="${txt.id}" title="Eliminar">🗑</button>
            </div>
        `;
        refs.textsList.appendChild(div);
    });

    refs.textsList.querySelectorAll('.btn-edit-text').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const textRecord = state.savedTexts.find((txt) => txt.id === id);
            if (!textRecord) {
                return;
            }

            state.setEditingTextId(id);
            refs.textNameInput.value = textRecord.name;
            refs.textContentInput.value = textRecord.content;
            refs.textEditorPanel.style.display = 'flex';
        });
    });

    refs.textsList.querySelectorAll('.btn-delete-text').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const textRecord = state.savedTexts.find((txt) => txt.id === id);
            if (!textRecord) {
                return;
            }

            if (confirm(`¿Eliminar el texto "${textRecord.name}"?`)) {
                state.setSavedTexts(state.savedTexts.filter((txt) => txt.id !== id));
                saveTexts();
                renderTexts();
            }
        });
    });
}

export function initTextsRender() {
    refs.btnNewText.addEventListener('click', () => {
        state.setEditingTextId(null);
        refs.textNameInput.value = '';
        refs.textContentInput.value = '';
        refs.textEditorPanel.style.display = 'flex';
        refs.textNameInput.focus();
    });

    refs.btnCancelText.addEventListener('click', () => {
        refs.textEditorPanel.style.display = 'none';
        state.setEditingTextId(null);
    });

    refs.btnSaveText.addEventListener('click', () => {
        const name = refs.textNameInput.value.trim();
        const content = refs.textContentInput.value;

        if (!name) {
            alert('El texto necesita un nombre.');
            return;
        }

        if (!content.trim()) {
            alert('El contenido no puede estar vacio.');
            return;
        }

        if (state.editingTextId) {
            state.setSavedTexts(state.savedTexts.map((txt) => (
                txt.id === state.editingTextId
                    ? { ...txt, name, content }
                    : txt
            )));
        } else {
            state.setSavedTexts([
                ...state.savedTexts,
                { id: `txt-${Date.now()}`, name, content }
            ]);
        }

        saveTexts();
        renderTexts();
    });
}