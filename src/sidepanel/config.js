import { refs } from './dom-refs.js';

export function initConfig() {
    chrome.storage.local.get(['apiKey', 'modelId'], (res) => {
        if (res.apiKey) refs.apiKey.value = res.apiKey;
        if (res.modelId) refs.modelId.value = res.modelId;
    });

    refs.btnSaveConfig.addEventListener('click', () => {
        const apiKey = refs.apiKey.value;
        const modelId = refs.modelId.value;
        chrome.storage.local.set({ apiKey, modelId }, () => {
            refs.configPanel.style.display = 'none';
            alert('Ajustes guardados.');
        });
    });

    refs.btnConfig.addEventListener('click', () => {
        refs.configPanel.style.display = refs.configPanel.style.display === 'block' ? 'none' : 'block';
    });
}