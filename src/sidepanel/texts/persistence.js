import * as state from '../state.js';

export function loadTexts() {
    chrome.storage.local.get(['savedTexts'], (res) => {
        state.setSavedTexts(res.savedTexts || []);
    });
}

export function saveTexts() {
    chrome.storage.local.set({ savedTexts: state.savedTexts });
}

export function initTextsPersistence() {
    loadTexts();
}