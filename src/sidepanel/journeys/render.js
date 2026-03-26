import { refs } from '../dom-refs.js';
import * as state from '../state.js';
import { exportJourneyAsFile } from './export.js';
import { saveJourneys } from './persistence.js';
import { playJourney } from './playback.js';

export function renameJourney(index) {
    const journey = state.savedJourneys[index];
    if (!journey) {
        return;
    }

    const nextName = prompt('Editar titulo del journey:', journey.name);
    if (nextName === null) {
        return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName) {
        alert('El titulo no puede estar vacio.');
        return;
    }

    if (trimmedName === journey.name) {
        return;
    }

    const updatedJourneys = [...state.savedJourneys];
    updatedJourneys[index] = { ...journey, name: trimmedName };
    state.setSavedJourneys(updatedJourneys);
    saveJourneys();
    renderJourneys();
}

export function renderJourneys() {
    refs.journeysList.innerHTML = '';
    if (state.savedJourneys.length === 0) {
        refs.journeysList.innerHTML = '<div class="journey-empty">No hay secuencias guardadas.</div>';
        return;
    }

    state.savedJourneys.forEach((journey, index) => {
        const wrapper = document.createElement('div');
        const header = document.createElement('div');
        header.className = 'journey-item';
        header.innerHTML = `
            <button class="btn-toggle-steps" title="Ver pasos">▶</button>
            <div class="journey-info">
                <b>${journey.name}</b>
                <span>${journey.steps.length} pasos · ${journey.createdAt}</span>
            </div>
            <div class="journey-actions">
                <button class="btn-edit-journey" data-index="${index}" title="Editar titulo">✏</button>
                <button class="btn-play-journey" data-index="${index}" title="Reproducir">▶</button>
                <button class="btn-export-journey" data-index="${index}" title="Exportar JSON">⬇</button>
                <button class="btn-delete-journey" data-index="${index}" title="Eliminar">🗑</button>
            </div>
        `;

        const stepsContainer = document.createElement('div');
        stepsContainer.className = 'steps-container';

        if (journey.steps && journey.steps.length > 0) {
            journey.steps.forEach((step, stepIdx) => {
                const stepDiv = document.createElement('div');

                if (step.stepType === 'paste_text') {
                    stepDiv.className = 'step-item step-type-paste';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-paste-badge">TEXTO</span>
                        <span class="step-desc" title="${step.textName || 'Texto guardado'}">${step.textName || 'Texto guardado'}</span>
                    `;
                } else if (step.stepType === 'key_press') {
                    stepDiv.className = 'step-item step-type-key';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-key-badge">TECLA</span>
                        <span class="step-key-label">${step.label || step.key}</span>
                    `;
                } else if (step.stepType === 'wait') {
                    stepDiv.className = 'step-item step-type-wait';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-wait-badge">ESPERA</span>
                        <span class="step-desc">${step.label}</span>
                    `;
                } else {
                    const selectorDisplay = step.selector ? (step.selector.length > 30 ? `...${step.selector.slice(-30)}` : step.selector) : '';
                    stepDiv.className = 'step-item';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-desc" title="${step.text || step.selector}">${step.text || 'Acción sin nombre'}</span>
                        <span class="step-selector" title="${step.selector || ''}">${selectorDisplay}</span>
                    `;
                }

                stepsContainer.appendChild(stepDiv);
            });
        } else {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'step-item';
            emptyDiv.innerHTML = '<span style="color:#999; font-style:italic;">No hay pasos grabados</span>';
            stepsContainer.appendChild(emptyDiv);
        }

        const toggleBtn = header.querySelector('.btn-toggle-steps');
        toggleBtn.addEventListener('click', () => {
            const isHidden = getComputedStyle(stepsContainer).display === 'none';
            stepsContainer.style.display = isHidden ? 'block' : 'none';
            toggleBtn.textContent = isHidden ? '▼' : '▶';
        });

        wrapper.appendChild(header);
        wrapper.appendChild(stepsContainer);
        refs.journeysList.appendChild(wrapper);
    });

    refs.journeysList.querySelectorAll('.btn-edit-journey').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            renameJourney(parseInt(btn.getAttribute('data-index'), 10));
        });
    });

    refs.journeysList.querySelectorAll('.btn-play-journey').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            playJourney(state.savedJourneys[parseInt(btn.getAttribute('data-index'), 10)]);
        });
    });

    refs.journeysList.querySelectorAll('.btn-export-journey').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            exportJourneyAsFile(state.savedJourneys[parseInt(btn.getAttribute('data-index'), 10)]);
        });
    });

    refs.journeysList.querySelectorAll('.btn-delete-journey').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-index'), 10);
            const journey = state.savedJourneys[idx];
            if (journey && confirm(`¿Eliminar la secuencia "${journey.name}"?`)) {
                state.setSavedJourneys(state.savedJourneys.filter((_, currentIndex) => currentIndex !== idx));
                saveJourneys();
                renderJourneys();
            }
        });
    });
}