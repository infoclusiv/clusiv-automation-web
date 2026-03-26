import { startAudioObserver } from './audio/observer.js';
import { registerFocusTracking } from './dom/visibility.js';
import { registerContentMessageHandlers } from './message-handler.js';
import { registerRecordingListeners } from './recording.js';

registerContentMessageHandlers();
registerRecordingListeners();
registerFocusTracking();
startAudioObserver();