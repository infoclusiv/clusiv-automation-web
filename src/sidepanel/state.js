export let lastAnalysisData = null;
export let chatHistory = [];
export let isRecording = false;
export let recordedSteps = [];
export let savedJourneys = [];
export let savedTexts = [];
export let isPlaying = false;
export let stopPlaybackFlag = false;
export let editingTextId = null;
export let externalVariables = {};

export const PLAYBACK_DELAY_MS = 1000;

export function setLastAnalysisData(value) {
    lastAnalysisData = value;
}

export function setChatHistory(value) {
    chatHistory = value;
}

export function appendChatHistory(...entries) {
    chatHistory = [...chatHistory, ...entries];
}

export function setIsRecording(value) {
    isRecording = value;
}

export function setRecordedSteps(value) {
    recordedSteps = value;
}

export function addRecordedStep(step) {
    recordedSteps = [...recordedSteps, step];
}

export function setSavedJourneys(value) {
    savedJourneys = value;
}

export function setSavedTexts(value) {
    savedTexts = value;
}

export function setIsPlaying(value) {
    isPlaying = value;
}

export function setStopPlaybackFlag(value) {
    stopPlaybackFlag = value;
}

export function setEditingTextId(value) {
    editingTextId = value;
}

export function setExternalVariables(value) {
    externalVariables = value;
}