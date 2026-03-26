import { ClusivLogger } from '../shared/debug-logger.js';
import { ClusivJourneyRuntime } from '../shared/journey-runtime.js';
import { CHATGPT_TAB_PATTERNS } from './constants.js';
import { sendStatusToPython } from './python-bridge.js';
import { resolveTargetTab } from './tab-manager.js';
import * as state from './state.js';

export async function getExecutionPreparation(journeyId, options = {}) {
    const storageState = await state.storageGet(['savedJourneys', 'savedTexts', 'externalVariables']);
    const journeys = storageState.savedJourneys || [];
    const savedTexts = storageState.savedTexts || [];
    const variables = {
        ...storageState.externalVariables,
        ...state.externalVariablesCache,
        ...(options.externalVariables || {})
    };
    const journey = journeys.find((candidate) => candidate.id === journeyId) || null;

    if (!journey) {
        return {
            ok: false,
            error: `Journey ID '${journeyId}' no encontrado en la extensión.`,
            issues: [
                {
                    severity: 'error',
                    code: 'journey_missing',
                    message: `Journey ID '${journeyId}' no encontrado en la extensión.`
                }
            ]
        };
    }

    const plan = ClusivJourneyRuntime.buildJourneyExecutionPlan({
        journey,
        savedTexts,
        externalVariables: variables,
        finalText: options.textToPaste || null
    });

    return {
        ok: !plan.hasBlockingIssues,
        journey,
        plan,
        variables
    };
}

export function summarizeValidationIssues(issues) {
    const blockingIssues = (issues || []).filter((issue) => issue.severity === 'error');
    if (blockingIssues.length === 0) {
        return 'Validación completada sin errores.';
    }

    return blockingIssues.map((issue) => issue.message).join(' | ');
}

export async function validateJourneyExecution(journeyId, options = {}) {
    const preparation = await getExecutionPreparation(journeyId, options);
    const issues = preparation.issues ? [...preparation.issues] : [...(preparation.plan?.issues || [])];

    if (!preparation.journey || !preparation.plan) {
        return {
            ok: false,
            journeyId,
            issues,
            message: summarizeValidationIssues(issues) || preparation.error || 'No se pudo preparar la ejecución.'
        };
    }

    let tab = null;
    try {
        if (typeof options.preferredTabId === 'number') {
            tab = await chrome.tabs.get(options.preferredTabId);
        } else {
            tab = await resolveTargetTab(options.tabUrlPatterns || CHATGPT_TAB_PATTERNS);
        }
    } catch (error) {
        issues.push({
            severity: 'error',
            code: 'target_tab_unavailable',
            message: error.message || 'No se pudo preparar la pestaña objetivo.'
        });
    }

    if (!tab) {
        issues.push({
            severity: 'error',
            code: 'target_tab_missing',
            message: 'No se encontró una pestaña lista para ejecutar el journey.'
        });
    }

    let contentValidation = null;
    if (tab) {
        try {
            contentValidation = await chrome.tabs.sendMessage(tab.id, {
                action: 'VALIDATE_EXECUTION_PLAN',
                steps: preparation.plan.steps
            });
        } catch {
            issues.push({
                severity: 'error',
                code: 'content_script_unavailable',
                message: 'La pestaña objetivo no respondió a la validación del sitio.'
            });
        }
    }

    if (contentValidation?.steps) {
        contentValidation.steps.forEach((stepValidation) => {
            if (stepValidation.status !== 'ok') {
                issues.push({
                    severity: 'error',
                    code: stepValidation.code || 'site_validation_failed',
                    stepIndex: stepValidation.stepIndex,
                    message: `Paso ${stepValidation.stepIndex + 1}: ${stepValidation.message}`
                });
            }
        });
    }

    return {
        ok: !issues.some((issue) => issue.severity === 'error'),
        journeyId,
        journeyName: preparation.plan.journeyName,
        requiredVariables: preparation.plan.requiredVariables,
        missingVariables: preparation.plan.missingVariables,
        missingTexts: preparation.plan.missingTexts,
        issues,
        tabId: tab?.id || null,
        page: contentValidation?.page || (tab ? { url: tab.url, title: tab.title || '' } : null),
        message: summarizeValidationIssues(issues)
    };
}

export async function executeJourney(journeyId, textToPaste, options = {}) {
    const executionId = options.executionId || null;

    ClusivLogger.journey('execute_journey_start', {
        journey_id: journeyId,
        execution_id: executionId,
        has_text_to_paste: Boolean(textToPaste)
    });

    const preparation = await getExecutionPreparation(journeyId, {
        ...options,
        textToPaste
    });

    if (!preparation.journey || !preparation.plan) {
        ClusivLogger.error('execute_journey_preparation_failed', {
            journey_id: journeyId,
            execution_id: executionId,
            error: preparation.error || summarizeValidationIssues(preparation.issues || [])
        });
        sendStatusToPython('error', preparation.error || summarizeValidationIssues(preparation.issues || []), journeyId, executionId);
        return;
    }

    const journey = preparation.journey;
    const plan = preparation.plan;

    if (plan.hasBlockingIssues) {
        ClusivLogger.error('execute_journey_blocked', {
            journey_id: journeyId,
            execution_id: executionId,
            issues: plan.issues || []
        });
        sendStatusToPython('error', summarizeValidationIssues(plan.issues), journeyId, executionId);
        return;
    }

    if (!sendStatusToPython('started', `Iniciando secuencia: ${journey.name} (${plan.steps.length} pasos)`, journeyId, executionId)) {
        return;
    }

    let tab;
    try {
        if (typeof options.preferredTabId === 'number') {
            tab = await chrome.tabs.get(options.preferredTabId);
        } else {
            tab = await resolveTargetTab(options.tabUrlPatterns || CHATGPT_TAB_PATTERNS);
        }
    } catch (error) {
        ClusivLogger.error('execute_journey_target_tab_failed', {
            journey_id: journeyId,
            execution_id: executionId,
            error: error.message || String(error)
        });
        sendStatusToPython('error', error.message || 'No se pudo preparar la pestaña objetivo.', journeyId, executionId);
        return;
    }

    if (!tab) {
        ClusivLogger.error('execute_journey_target_tab_missing', {
            journey_id: journeyId,
            execution_id: executionId
        });
        sendStatusToPython('error', 'No se encontró una pestaña de ChatGPT lista para ejecutar el journey.', journeyId, executionId);
        return;
    }

    ClusivLogger.journey('execute_journey_target_tab_ready', {
        journey_id: journeyId,
        execution_id: executionId,
        tab_id: tab.id,
        url: tab.url || null,
        step_count: plan.steps.length
    });

    let shouldStopExecution = false;
    const executionResult = await ClusivJourneyRuntime.executeJourneyPlan({
        plan,
        sendToTab: (payload) => chrome.tabs.sendMessage(tab.id, payload),
        shouldStop: () => shouldStopExecution,
        onStepStart: (step, stepIndex, totalSteps) => {
            ClusivLogger.journey('journey_step_started', {
                journey_id: journeyId,
                execution_id: executionId,
                step_index: stepIndex,
                total_steps: totalSteps,
                step_type: step.stepType || null,
                label: ClusivJourneyRuntime.getStepDisplayLabel(step)
            });
            const statusSent = sendStatusToPython(
                'progress',
                `Ejecutando paso ${stepIndex + 1}/${totalSteps}: ${ClusivJourneyRuntime.getStepDisplayLabel(step)}`,
                journeyId,
                executionId
            );
            if (!statusSent) {
                ClusivLogger.error('journey_step_status_send_failed', {
                    journey_id: journeyId,
                    execution_id: executionId,
                    step_index: stepIndex
                });
                shouldStopExecution = true;
            }
        }
    });

    if (executionResult.status === 'stopped') {
        ClusivLogger.warning('execute_journey_stopped', {
            journey_id: journeyId,
            execution_id: executionId
        });
        return;
    }

    if (executionResult.status === 'error') {
        ClusivLogger.error('execute_journey_failed', {
            journey_id: journeyId,
            execution_id: executionId,
            error: executionResult.message || 'El journey fallo durante la ejecucion.'
        });
        sendStatusToPython('error', executionResult.message || 'El journey fallo durante la ejecucion.', journeyId, executionId);
        return;
    }

    if (plan.finalText) {
        if (!sendStatusToPython('paste_completed', 'Script pegado correctamente', journeyId, executionId)) {
            return;
        }
    }

    ClusivLogger.journey('journey_execution_completed', {
        journey_id: journeyId,
        execution_id: executionId,
        final_status: executionResult.status
    });
    sendStatusToPython('completed', `✅ Secuencia finalizada: ${journey.name}`, journeyId, executionId);
}