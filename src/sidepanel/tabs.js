import { refs } from './dom-refs.js';
import { renderJourneys } from './journeys/render.js';
import { renderTexts } from './texts/render.js';

export function switchTab(target) {
    refs.tabLogs.classList.toggle('active', target === 'logs');
    refs.tabChat.classList.toggle('active', target === 'chat');
    refs.tabJourneys.classList.toggle('active', target === 'journeys');
    refs.tabTexts.classList.toggle('active', target === 'texts');
    refs.viewLogs.classList.toggle('active', target === 'logs');
    refs.viewChat.classList.toggle('active', target === 'chat');
    refs.viewJourneys.classList.toggle('active', target === 'journeys');
    refs.viewTexts.classList.toggle('active', target === 'texts');

    if (target === 'journeys') {
        renderJourneys();
    }

    if (target === 'texts') {
        renderTexts();
    }
}

export function initTabs() {
    refs.tabLogs.addEventListener('click', () => switchTab('logs'));
    refs.tabChat.addEventListener('click', () => switchTab('chat'));
    refs.tabJourneys.addEventListener('click', () => switchTab('journeys'));
    refs.tabTexts.addEventListener('click', () => switchTab('texts'));
}