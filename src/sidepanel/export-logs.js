import { ClusivLogger } from '../shared/debug-logger.js';
import { refs } from './dom-refs.js';

export function initExportLogs() {
    refs.btnExportLogs.addEventListener('click', async () => {
        const sidepanelLogs = ClusivLogger.getBuffer();

        let backgroundLogs = [];
        try {
            backgroundLogs = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'GET_DEBUG_LOGS' }, (response) => {
                    resolve(response?.logs || []);
                });
            });
        } catch (error) {
            console.warn('No se pudieron obtener logs del background:', error);
        }

        const exportData = {
            exported_at: new Date().toISOString(),
            sidepanel_session: ClusivLogger.getSessionId(),
            sidepanel_logs: sidepanelLogs,
            background_logs: backgroundLogs
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `clusiv_debug_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
}