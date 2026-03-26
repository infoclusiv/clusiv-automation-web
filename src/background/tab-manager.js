import { ClusivLogger } from '../shared/debug-logger.js';
import { CHATGPT_HOME_URL, CHATGPT_TAB_PATTERNS } from './constants.js';
import {
    preferredChatGptTabId,
    setPreferredChatGptTabId as setPreferredChatGptTabIdState
} from './state.js';

export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForTabComplete(tabId, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.status === 'complete') {
            return tab;
        }
        await delay(300);
    }

    throw new Error('La pestaña objetivo no terminó de cargar a tiempo.');
}

export async function findTargetTabByPatterns(patterns, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const tabs = await chrome.tabs.query({ url: patterns });
        if (tabs.length > 0) {
            return tabs[0];
        }
        await delay(400);
    }

    return null;
}

export async function getPreferredChatGptTab(patterns) {
    if (!preferredChatGptTabId) {
        return null;
    }

    try {
        const tab = await chrome.tabs.get(preferredChatGptTabId);
        if (!tab || !tab.url) {
            setPreferredChatGptTabId(null);
            return null;
        }

        const matchesPattern = patterns.length === 0 || patterns.some((pattern) => {
            const prefix = pattern.replace('*', '');
            return tab.url.startsWith(prefix);
        });

        if (!matchesPattern) {
            setPreferredChatGptTabId(null);
            return null;
        }

        return tab;
    } catch {
        setPreferredChatGptTabId(null);
        return null;
    }
}

export function setPreferredChatGptTabId(tabId) {
    const nextValue = typeof tabId === 'number' ? tabId : null;
    setPreferredChatGptTabIdState(nextValue);

    if (nextValue !== null) {
        chrome.storage.session.set({ preferredChatGptTabId: nextValue });
        return;
    }

    chrome.storage.session.remove('preferredChatGptTabId');
}

export async function prepareChatGptTab(tabUrlPatterns = CHATGPT_TAB_PATTERNS, requestId = null) {
    const patterns = Array.isArray(tabUrlPatterns) && tabUrlPatterns.length > 0
        ? tabUrlPatterns
        : CHATGPT_TAB_PATTERNS;

    ClusivLogger.info('prepare_chatgpt_tab_start', {
        request_id: requestId,
        patterns
    });

    let tab = await getPreferredChatGptTab(patterns);
    let status = 'ready';
    let message = 'Usando pestaña existente de ChatGPT.';

    if (!tab) {
        const existingTabs = await chrome.tabs.query({ url: patterns });
        if (existingTabs.length > 0) {
            tab = existingTabs[0];
        }
    }

    if (!tab) {
        tab = await chrome.tabs.create({ url: CHATGPT_HOME_URL, active: true });
        status = 'created';
        message = 'Se abrió una nueva pestaña de ChatGPT.';
    }

    setPreferredChatGptTabId(tab.id);

    if (typeof tab.windowId === 'number') {
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {
        });
    }

    await chrome.tabs.update(tab.id, { active: true });
    const readyTab = tab.status === 'complete' ? tab : await waitForTabComplete(tab.id);

    setPreferredChatGptTabId(readyTab.id);
    ClusivLogger.info('prepare_chatgpt_tab_ready', {
        request_id: requestId,
        tab_id: readyTab.id,
        url: readyTab.url,
        status
    });

    return {
        tab: readyTab,
        status,
        message
    };
}

export async function resolveTargetTab(tabUrlPatterns = []) {
    const patterns = Array.isArray(tabUrlPatterns) && tabUrlPatterns.length > 0
        ? tabUrlPatterns
        : [];

    const preferredTab = await getPreferredChatGptTab(patterns);
    if (preferredTab) {
        await chrome.tabs.update(preferredTab.id, { active: true });
        return preferredTab.status === 'complete'
            ? preferredTab
            : await waitForTabComplete(preferredTab.id);
    }

    if (patterns.length > 0) {
        const matchingTab = await findTargetTabByPatterns(patterns);
        if (matchingTab) {
            setPreferredChatGptTabId(matchingTab.id);
            await chrome.tabs.update(matchingTab.id, { active: true });
            return matchingTab.status === 'complete'
                ? matchingTab
                : await waitForTabComplete(matchingTab.id);
        }
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
        return null;
    }

    setPreferredChatGptTabId(activeTab.id);

    return activeTab.status === 'complete'
        ? activeTab
        : await waitForTabComplete(activeTab.id);
}