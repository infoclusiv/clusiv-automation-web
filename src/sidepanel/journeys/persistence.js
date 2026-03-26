import * as state from '../state.js';

export function sendJourneysToPython() {
    chrome.runtime.sendMessage({ action: 'SYNC_JOURNEYS_TO_BACKEND' }, () => {
    });
}

export function loadJourneys() {
    chrome.storage.local.get(['savedJourneys'], (res) => {
        state.setSavedJourneys(res.savedJourneys || []);
    });
}

export function saveJourneys() {
    chrome.storage.local.set({ savedJourneys: state.savedJourneys }, () => {
        sendJourneysToPython();
    });
}

export function initJourneyPersistence() {
    loadJourneys();
}