import { findTargetElement } from './dom/locators.js';
import { findEditableCandidate } from './dom/visibility.js';

export function validateExecutionStep(step) {
    if (!step || typeof step !== 'object') {
        return {
            status: 'error',
            code: 'invalid_step',
            message: 'El paso no tiene una estructura valida.'
        };
    }

    if (step.stepType === 'key_press') {
        return {
            status: 'ok',
            code: 'key_ready',
            message: 'La simulacion de teclado esta disponible.'
        };
    }

    if (step.stepType === 'wait') {
        return {
            status: 'ok',
            code: 'wait_ready',
            message: 'El paso de espera no requiere validación del DOM.'
        };
    }

    if (step.stepType === 'paste_text') {
        const editable = findEditableCandidate();
        if (!editable) {
            return {
                status: 'error',
                code: 'editable_not_found',
                message: 'No se encontro un campo editable listo para insertar texto.'
            };
        }

        return {
            status: 'ok',
            code: 'editable_ready',
            message: 'Se encontro un campo editable para insertar texto.'
        };
    }

    const targetElement = findTargetElement(step);
    if (!targetElement) {
        return {
            status: 'error',
            code: 'target_not_found',
            message: 'No se encontro el elemento del paso en el DOM actual.'
        };
    }

    return {
        status: 'ok',
        code: 'target_ready',
        message: 'El elemento del paso esta disponible en el DOM.'
    };
}