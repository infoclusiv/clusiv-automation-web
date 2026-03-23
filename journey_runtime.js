(function (root) {
    const PLACEHOLDER_REGEX = /\[([A-Z0-9_]+)\]/g;

    function unique(values) {
        return Array.from(new Set(values.filter(Boolean)));
    }

    function cloneStep(step) {
        return step ? JSON.parse(JSON.stringify(step)) : step;
    }

    function buildTextIndex(savedTexts) {
        return (savedTexts || []).reduce((accumulator, textRecord) => {
            if (textRecord && textRecord.id) {
                accumulator[textRecord.id] = textRecord;
            }
            return accumulator;
        }, {});
    }

    function extractTemplateVariables(content) {
        if (!content || typeof content !== 'string') {
            return [];
        }

        const matches = [];
        let match = PLACEHOLDER_REGEX.exec(content);
        while (match) {
            matches.push(match[1]);
            match = PLACEHOLDER_REGEX.exec(content);
        }
        PLACEHOLDER_REGEX.lastIndex = 0;
        return unique(matches);
    }

    function resolveTemplateVariables(content, externalVariables) {
        if (!content || typeof content !== 'string') {
            return {
                content,
                requiredVariables: [],
                missingVariables: []
            };
        }

        const requiredVariables = [];
        const missingVariables = [];
        const variables = externalVariables || {};
        const resolvedContent = content.replace(PLACEHOLDER_REGEX, (match, variableName) => {
            requiredVariables.push(variableName);
            const value = variables[variableName];
            if (typeof value === 'string' || typeof value === 'number') {
                return String(value);
            }
            missingVariables.push(variableName);
            return match;
        });

        PLACEHOLDER_REGEX.lastIndex = 0;

        return {
            content: resolvedContent,
            requiredVariables: unique(requiredVariables),
            missingVariables: unique(missingVariables)
        };
    }

    function buildJourneyExecutionPlan(options) {
        const journey = options?.journey || null;
        const savedTexts = options?.savedTexts || [];
        const externalVariables = options?.externalVariables || {};
        const finalText = options?.finalText || null;
        const steps = [];
        const issues = [];
        const requiredVariables = [];
        const missingVariables = [];
        const missingTexts = [];

        if (!journey || !journey.id) {
            return {
                journeyId: null,
                journeyName: '',
                steps: [],
                finalText: null,
                requiredVariables: [],
                missingVariables: [],
                missingTexts: [],
                issues: [
                    {
                        severity: 'error',
                        code: 'journey_missing',
                        message: 'El journey no existe o no tiene identificador.'
                    }
                ],
                hasBlockingIssues: true
            };
        }

        if (!Array.isArray(journey.steps)) {
            return {
                journeyId: journey.id,
                journeyName: journey.name || '',
                steps: [],
                finalText: null,
                requiredVariables: [],
                missingVariables: [],
                missingTexts: [],
                issues: [
                    {
                        severity: 'error',
                        code: 'journey_invalid_steps',
                        message: 'El journey guardado no tiene una lista valida de pasos.'
                    }
                ],
                hasBlockingIssues: true
            };
        }

        const textIndex = buildTextIndex(savedTexts);

        journey.steps.forEach((step, index) => {
            const plannedStep = cloneStep(step) || {};
            plannedStep.stepIndex = index;

            if (plannedStep.stepType === 'paste_text') {
                const textRecord = plannedStep.textId ? textIndex[plannedStep.textId] : null;
                if (!textRecord) {
                    missingTexts.push(plannedStep.textId || `step-${index + 1}`);
                    issues.push({
                        severity: 'error',
                        code: 'missing_text_record',
                        stepIndex: index,
                        textId: plannedStep.textId || null,
                        message: `El paso ${index + 1} referencia un texto guardado que ya no existe.`
                    });
                    plannedStep.text = '';
                    plannedStep.textName = plannedStep.textName || 'Texto faltante';
                } else {
                    const resolution = resolveTemplateVariables(textRecord.content, externalVariables);
                    plannedStep.text = resolution.content;
                    plannedStep.textName = textRecord.name;
                    plannedStep.originalText = textRecord.content;
                    plannedStep.requiredVariables = resolution.requiredVariables;
                    plannedStep.missingVariables = resolution.missingVariables;
                    requiredVariables.push(...resolution.requiredVariables);
                    missingVariables.push(...resolution.missingVariables);

                    resolution.missingVariables.forEach((variableName) => {
                        issues.push({
                            severity: 'error',
                            code: 'missing_template_variable',
                            stepIndex: index,
                            variableName,
                            message: `Falta la variable [${variableName}] para resolver el texto del paso ${index + 1}.`
                        });
                    });
                }
            }

            if (!plannedStep.stepType) {
                issues.push({
                    severity: 'warning',
                    code: 'missing_step_type',
                    stepIndex: index,
                    message: `El paso ${index + 1} no tiene stepType explicito; se tratara como clic.`
                });
            }

            steps.push(plannedStep);
        });

        let resolvedFinalText = null;
        if (typeof finalText === 'string' && finalText.length > 0) {
            const resolution = resolveTemplateVariables(finalText, externalVariables);
            resolvedFinalText = resolution.content;
            requiredVariables.push(...resolution.requiredVariables);
            missingVariables.push(...resolution.missingVariables);
            resolution.missingVariables.forEach((variableName) => {
                issues.push({
                    severity: 'error',
                    code: 'missing_final_text_variable',
                    variableName,
                    message: `Falta la variable [${variableName}] para resolver el texto final del journey.`
                });
            });
        }

        return {
            journeyId: journey.id,
            journeyName: journey.name || '',
            steps,
            finalText: resolvedFinalText,
            requiredVariables: unique(requiredVariables),
            missingVariables: unique(missingVariables),
            missingTexts: unique(missingTexts),
            issues,
            hasBlockingIssues: issues.some((issue) => issue.severity === 'error')
        };
    }

    function getStepDisplayLabel(step, fallback = 'Paso') {
        if (!step || typeof step !== 'object') {
            return fallback;
        }

        if (step.stepType === 'key_press') {
            return `[Tecla] ${step.label || step.key || fallback}`;
        }

        if (step.stepType === 'paste_text') {
            return `[Texto] ${step.textName || fallback}`;
        }

        if (step.stepType === 'wait') {
            return step.label || `[Espera] ${step.durationMs / 1000}s`;
        }

        return step.text || fallback;
    }

    function summarizeBlockingIssues(issues) {
        const blockingIssues = (issues || []).filter((issue) => issue.severity === 'error');
        if (blockingIssues.length === 0) {
            return 'Validacion completada sin errores.';
        }

        return blockingIssues.map((issue) => issue.message).join(' | ');
    }

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function executeJourneyPlan(options) {
        const plan = options?.plan;
        const sendToTab = options?.sendToTab;
        const shouldStop = options?.shouldStop || (() => false);
        const onStepStart = options?.onStepStart || (() => {});
        const onStepSuccess = options?.onStepSuccess || (() => {});
        const betweenStepDelayMs = typeof options?.betweenStepDelayMs === 'number'
            ? options.betweenStepDelayMs
            : 1500;
        const finalTextDelayMs = typeof options?.finalTextDelayMs === 'number'
            ? options.finalTextDelayMs
            : 1000;

        if (!plan || typeof sendToTab !== 'function') {
            return {
                status: 'error',
                message: 'No se pudo iniciar la ejecucion compartida del journey.'
            };
        }

        for (let i = 0; i < plan.steps.length; i += 1) {
            if (shouldStop()) {
                return {
                    status: 'stopped',
                    stepIndex: i,
                    message: 'La ejecucion del journey fue detenida manualmente.'
                };
            }

            const step = plan.steps[i];
            onStepStart(step, i, plan.steps.length);

            if (step.stepType === 'wait') {
                await wait(step.durationMs || 1000);
                onStepSuccess(step, i, plan.steps.length);
                continue;
            }

            if (step.stepType === 'key_press') {
                try {
                    await sendToTab({
                        action: 'SIMULATE_KEY',
                        key: step.key,
                        code: step.code,
                        keyCode: step.keyCode,
                        ctrlKey: step.ctrlKey || false,
                        shiftKey: step.shiftKey || false,
                        altKey: step.altKey || false
                    }, step, i);
                } catch (error) {
                    return {
                        status: 'error',
                        stepIndex: i,
                        step,
                        message: `Fallo de conexion al simular tecla en paso ${i + 1}.`,
                        cause: error
                    };
                }

                onStepSuccess(step, i, plan.steps.length);
                if (i < plan.steps.length - 1) {
                    await wait(betweenStepDelayMs);
                }
                continue;
            }

            if (step.stepType === 'paste_text') {
                try {
                    const response = await sendToTab({
                        action: 'PASTE_TEXT',
                        text: step.text || ''
                    }, step, i);

                    if (!response || response.status !== 'pasted') {
                        return {
                            status: 'error',
                            stepIndex: i,
                            step,
                            message: `Fallo al pegar en paso ${i + 1}: ${response?.message || 'El contenido no pudo insertarse en el campo objetivo.'}`
                        };
                    }
                } catch (error) {
                    return {
                        status: 'error',
                        stepIndex: i,
                        step,
                        message: `Fallo de conexion al pegar texto en paso ${i + 1}.`,
                        cause: error
                    };
                }

                onStepSuccess(step, i, plan.steps.length);
                if (i < plan.steps.length - 1) {
                    await wait(betweenStepDelayMs);
                }
                continue;
            }

            try {
                const response = await sendToTab({
                    action: 'SIMULATE_CLICK',
                    id: step.aiRef,
                    selector: step.selector,
                    text: step.text,
                    locator: step.locator || null
                }, step, i);

                if (response && response.status === 'not_found') {
                    return {
                        status: 'error',
                        stepIndex: i,
                        step,
                        message: `Fallo en el paso ${i + 1}: Elemento no encontrado en el DOM.`
                    };
                }
            } catch (error) {
                return {
                    status: 'error',
                    stepIndex: i,
                    step,
                    message: `Fallo de conexion con la pestaña en el paso ${i + 1}.`,
                    cause: error
                };
            }

            onStepSuccess(step, i, plan.steps.length);
            if (i < plan.steps.length - 1) {
                await wait(betweenStepDelayMs);
            }
        }

        if (plan.finalText) {
            try {
                const response = await sendToTab({
                    action: 'PASTE_TEXT',
                    text: plan.finalText
                }, { stepType: 'final_text', text: plan.finalText }, plan.steps.length);

                if (!response || response.status !== 'pasted') {
                    return {
                        status: 'error',
                        stepIndex: plan.steps.length,
                        message: `Fallo al pegar: ${response?.message || 'El contenido no pudo insertarse en el campo objetivo.'}`
                    };
                }
            } catch (error) {
                return {
                    status: 'error',
                    stepIndex: plan.steps.length,
                    message: 'Error de conexion al intentar inyectar el script.',
                    cause: error
                };
            }

            await wait(finalTextDelayMs);
        }

        return {
            status: 'completed',
            message: 'Journey completado correctamente.'
        };
    }

    root.ClusivJourneyRuntime = {
        buildTextIndex,
        extractTemplateVariables,
        resolveTemplateVariables,
        buildJourneyExecutionPlan,
        getStepDisplayLabel,
        summarizeBlockingIssues,
        executeJourneyPlan
    };
})(typeof self !== 'undefined' ? self : window);