import { ClusivJourneyRuntime } from '../../shared/journey-runtime.js';
import { refs } from '../dom-refs.js';
import { loadExternalVariables } from '../external-variables.js';
import * as state from '../state.js';

export async function playJourney(journey) {
    if (state.isPlaying) {
        alert('Ya se está reproduciendo una secuencia.');
        return;
    }

    state.setIsPlaying(true);
    state.setStopPlaybackFlag(false);
    refs.playbackOverlay.classList.add('active');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        refs.playbackOverlay.classList.remove('active');
        state.setIsPlaying(false);
        return;
    }

    await loadExternalVariables();

    const plan = ClusivJourneyRuntime.buildJourneyExecutionPlan({
        journey,
        savedTexts: state.savedTexts,
        externalVariables: state.externalVariables
    });

    if (plan.hasBlockingIssues) {
        refs.playbackStepLabel.textContent = `⚠️ ${ClusivJourneyRuntime.summarizeBlockingIssues(plan.issues)}`;
        refs.playbackOverlay.classList.remove('active');
        state.setIsPlaying(false);
        return;
    }

    const executionResult = await ClusivJourneyRuntime.executeJourneyPlan({
        plan,
        sendToTab: (payload) => chrome.tabs.sendMessage(tab.id, payload),
        shouldStop: () => state.stopPlaybackFlag,
        betweenStepDelayMs: state.PLAYBACK_DELAY_MS,
        finalTextDelayMs: state.PLAYBACK_DELAY_MS,
        onStepStart: (step, stepIndex, totalSteps) => {
            refs.playbackStepLabel.textContent = `Paso ${stepIndex + 1}/${totalSteps}: ${ClusivJourneyRuntime.getStepDisplayLabel(step)}`;
        }
    });

    if (executionResult.status === 'error') {
        refs.playbackStepLabel.textContent = `⚠️ ${executionResult.message}`;
    } else if (executionResult.status === 'stopped') {
        refs.playbackStepLabel.textContent = '⏹ Reproducción detenida';
    }

    refs.playbackOverlay.classList.remove('active');
    state.setIsPlaying(false);
}

export function initPlaybackControls() {
    refs.btnStopPlayback.addEventListener('click', () => {
        state.setStopPlaybackFlag(true);
    });
}