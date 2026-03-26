export const INTERACTIVE_QUERY = [
    'button', 'a', 'input', 'select', 'textarea', 'option',
    "[role='button']", "[role='link']", "[role='option']",
    "[role='menuitem']", "[role='menuitemcheckbox']", "[role='menuitemradio']",
    "[role='tab']", "[role='switch']", "[role='checkbox']", "[role='radio']",
    "[role='combobox']", "[role='listbox']", "[role='searchbox']",
    "[role='slider']", "[role='spinbutton']", "[role='treeitem']",
    "[tabindex='0']",
    "[role='textbox']",
    "[aria-multiline='true']",
    '.ProseMirror',
    '.btn', '.button',
    '.mat-mdc-option', '.mdc-list-item', '.mat-option',
    '.dropdown-item', '.menu-item',
    '[onclick]', '[ng-click]', '[data-action]',
    'audio',
    'video',
    "[class*='audio']",
    "[class*='player']",
    "[class*='waveform']",
    "[class*='speech']",
    '.wavesurfer-wrapper',
    'wave'
].join(', ');

export const EDITABLE_QUERY = [
    'textarea',
    "input:not([type='button']):not([type='checkbox']):not([type='color']):not([type='file']):not([type='hidden']):not([type='image']):not([type='radio']):not([type='range']):not([type='reset']):not([type='submit'])",
    "[contenteditable='true']",
    "[contenteditable='']",
    "[role='textbox']",
    "[role='searchbox']"
].join(', ');