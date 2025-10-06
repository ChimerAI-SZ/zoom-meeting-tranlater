/**
 * BabelAI Chrome Extension - Modern Popup Controller
 * No API configuration UI - credentials are built-in
 */

import configManager from '../utils/config-manager.js';

// State management
const state = {
  isTranslating: false,
  currentLanguage: 'zh_CN',
  activeSection: null,
  healthInterval: null,
  sessionInfo: null
};

// DOM Elements
const elements = {};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  await initialize();
});

/**
 * Initialize the popup
 */
async function initialize() {
  // Cache DOM elements
  cacheElements();

  // Initialize configuration
  const configLoaded = await configManager.initialize();
  if (!configLoaded) {
    showError('errorConfig');
  }

  // Setup event listeners
  setupEventListeners();

  // Initialize UI state
  await initializeUI();

  // Start health monitoring if translating
  const session = await getSessionInfo();
  if (session?.state === 'connected') {
    startHealthMonitoring();
    updateMainButton(true);
  }
}

/**
 * Cache DOM elements for better performance
 */
function cacheElements() {
  // Main elements
  elements.mainButton = document.getElementById('mainButton');
  elements.statusDot = document.getElementById('statusDot');
  elements.statusText = document.getElementById('statusText');

  // Section toggles
  elements.settingsToggle = document.getElementById('settingsToggle');
  elements.healthToggle = document.getElementById('healthToggle');
  elements.historyToggle = document.getElementById('historyToggle');

  // Sections
  elements.settingsSection = document.getElementById('settingsSection');
  elements.healthSection = document.getElementById('healthSection');
  elements.historySection = document.getElementById('historySection');

  // Settings controls
  elements.fontSizeRange = document.getElementById('fontSizeRange');
  elements.fontSizeValue = document.getElementById('fontSizeValue');
  elements.opacityRange = document.getElementById('opacityRange');
  elements.opacityValue = document.getElementById('opacityValue');
  elements.positionSelect = document.getElementById('positionSelect');
  elements.displayModeSelect = document.getElementById('displayModeSelect');

  // Health metrics
  elements.healthUptime = document.getElementById('healthUptime');
  elements.healthPing = document.getElementById('healthPing');
  elements.healthRMS = document.getElementById('healthRMS');
  elements.healthQueue = document.getElementById('healthQueue');
  elements.healthEvents = document.getElementById('healthEvents');
  elements.healthErrors = document.getElementById('healthErrors');
  elements.healthReconnects = document.getElementById('healthReconnects');

  // History
  elements.historyList = document.getElementById('historyList');
  elements.clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Language buttons
  elements.langButtons = document.querySelectorAll('.lang-btn');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Main button
  elements.mainButton.addEventListener('click', handleMainButtonClick);

  // Section toggles
  elements.settingsToggle.addEventListener('click', () => toggleSection('settings'));
  elements.healthToggle.addEventListener('click', () => toggleSection('health'));
  elements.historyToggle.addEventListener('click', () => toggleSection('history'));

  // Settings changes
  elements.fontSizeRange.addEventListener('input', handleFontSizeChange);
  elements.opacityRange.addEventListener('input', handleOpacityChange);
  elements.positionSelect.addEventListener('change', handlePositionChange);
  elements.displayModeSelect.addEventListener('change', handleDisplayModeChange);

  // History
  elements.clearHistoryBtn.addEventListener('click', handleClearHistory);

  // Language switching
  elements.langButtons.forEach(btn => {
    btn.addEventListener('click', () => handleLanguageChange(btn.dataset.lang));
  });

  // Listen for storage changes (settings sync)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      handleStorageChanges(changes);
    }
  });
}

/**
 * Initialize UI with saved preferences
 */
async function initializeUI() {
  const config = configManager.getConfig();

  // Set UI language
  const userLang = config.uiLanguage || detectUserLanguage();
  await setUILanguage(userLang);

  // Load subtitle settings
  elements.fontSizeRange.value = config.subtitleFontSize || 16;
  elements.fontSizeValue.textContent = `${elements.fontSizeRange.value}px`;

  elements.opacityRange.value = (config.subtitleOpacity || 0.95) * 100;
  elements.opacityValue.textContent = `${elements.opacityRange.value}%`;

  elements.positionSelect.value = config.subtitlePosition || 'bottom-center';
  elements.displayModeSelect.value = config.displayMode || 'both';

  // Load history
  await loadHistory();
}

/**
 * Handle main button click (Start/Stop translation)
 */
async function handleMainButtonClick() {
  if (state.isTranslating) {
    await stopTranslation();
  } else {
    await startTranslation();
  }
}

/**
 * Start translation
 */
async function startTranslation() {
  try {
    // Check if we have API credentials
    const credentials = configManager.getAPICredentials();
    if (!credentials) {
      if (configManager.isDemoMode()) {
        showError('Demo mode - API credentials not configured');
      } else {
        showError('errorConfig');
      }
      return;
    }

    // Update UI to connecting state
    updateStatus('connecting');
    updateMainButton(true, true);

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showError('errorNoTab');
      updateStatus('idle');
      updateMainButton(false);
      return;
    }

    // Auto-detect language if needed
    let sourceLanguage = configManager.getConfig().sourceLanguage;
    if (sourceLanguage === 'auto') {
      sourceLanguage = await configManager.detectSourceLanguage();
    }
    const targetLanguage = configManager.getTargetLanguage(sourceLanguage);

    // Send start message to service worker
    const response = await chrome.runtime.sendMessage({
      type: 'start-capture',
      tabId: tab.id,
      config: {
        ...credentials,
        sourceLanguage,
        targetLanguage
      }
    });

    if (response?.ok) {
      state.isTranslating = true;
      state.sessionInfo = response;
      updateStatus('connected');
      updateMainButton(true);
      startHealthMonitoring();
    } else {
      throw new Error(response?.error || 'Failed to start');
    }

  } catch (error) {
    console.error('[Popup] Start failed:', error);
    showError('errorConnection');
    updateStatus('error');
    updateMainButton(false);
  }
}

/**
 * Stop translation
 */
async function stopTranslation() {
  try {
    updateStatus('stopping');
    updateMainButton(false, true);

    const response = await chrome.runtime.sendMessage({ type: 'stop-capture' });

    if (response?.ok) {
      state.isTranslating = false;
      state.sessionInfo = null;
      updateStatus('idle');
      updateMainButton(false);
      stopHealthMonitoring();
    } else {
      throw new Error(response?.error || 'Failed to stop');
    }

  } catch (error) {
    console.error('[Popup] Stop failed:', error);
    showError('errorGeneric');
    updateStatus('error');
    updateMainButton(false);
  }
}

/**
 * Update main button state
 */
function updateMainButton(isTranslating, isLoading = false) {
  const btnText = elements.mainButton.querySelector('.btn-text');
  const spinner = elements.mainButton.querySelector('.spinner');

  if (isLoading) {
    spinner.classList.remove('hidden');
    btnText.classList.add('hidden');
    elements.mainButton.disabled = true;
  } else {
    spinner.classList.add('hidden');
    btnText.classList.remove('hidden');
    elements.mainButton.disabled = false;

    if (isTranslating) {
      btnText.setAttribute('data-i18n', 'buttonStop');
      btnText.textContent = getMessage('buttonStop');
      elements.mainButton.classList.remove('btn-primary');
      elements.mainButton.classList.add('btn-secondary');
    } else {
      btnText.setAttribute('data-i18n', 'buttonStart');
      btnText.textContent = getMessage('buttonStart');
      elements.mainButton.classList.add('btn-primary');
      elements.mainButton.classList.remove('btn-secondary');
    }
  }

  state.isTranslating = isTranslating;
}

/**
 * Update status indicator
 */
function updateStatus(status) {
  const statusMap = {
    'idle': { class: '', i18n: 'statusIdle' },
    'connecting': { class: 'connecting', i18n: 'statusConnecting' },
    'connected': { class: 'connected', i18n: 'statusTranslating' },
    'error': { class: 'error', i18n: 'statusError' },
    'stopping': { class: '', i18n: 'statusStopping' }
  };

  const statusInfo = statusMap[status] || statusMap.idle;

  // Update dot
  elements.statusDot.className = `status-dot ${statusInfo.class}`;

  // Update text
  elements.statusText.setAttribute('data-i18n', statusInfo.i18n);
  elements.statusText.textContent = getMessage(statusInfo.i18n);
}

/**
 * Toggle collapsible sections
 */
function toggleSection(sectionName) {
  const sections = ['settings', 'health', 'history'];

  sections.forEach(name => {
    const section = elements[`${name}Section`];
    if (name === sectionName) {
      const isExpanded = section.classList.contains('expanded');
      section.classList.toggle('expanded', !isExpanded);
      state.activeSection = isExpanded ? null : name;

      // Start/stop health monitoring when health section is toggled
      if (name === 'health' && !isExpanded && state.isTranslating) {
        startHealthMonitoring();
      } else if (name === 'health' && isExpanded) {
        stopHealthMonitoring();
      }

      // Load history when history section is opened
      if (name === 'history' && !isExpanded) {
        loadHistory();
      }
    } else {
      section.classList.remove('expanded');
    }
  });
}

/**
 * Start health monitoring
 */
function startHealthMonitoring() {
  if (state.healthInterval) return;

  // Initial fetch
  updateHealthMetrics();

  // Update every second
  state.healthInterval = setInterval(updateHealthMetrics, 1000);
}

/**
 * Stop health monitoring
 */
function stopHealthMonitoring() {
  if (state.healthInterval) {
    clearInterval(state.healthInterval);
    state.healthInterval = null;
  }
}

/**
 * Update health metrics
 */
async function updateHealthMetrics() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-health' });

    if (response?.ok) {
      // Update uptime
      elements.healthUptime.textContent = formatUptime(response.uptime);

      // Update ping
      const ping = response.avgPingMs;
      elements.healthPing.textContent = ping ? `${Math.round(ping)}ms` : '--';
      elements.healthPing.style.color = getPingColor(ping);

      // Update RMS (audio level)
      const rms = response.avgRMS || response.currentRMS || response.inputLevelRMS || 0;
      elements.healthRMS.textContent = formatAudioLevel(rms);
      elements.healthRMS.style.color = getRMSColor(rms);

      // Update queue
      elements.healthQueue.textContent = response.queueSize || 0;

      // Update counters
      elements.healthEvents.textContent = response.wsEvents || 0;
      elements.healthErrors.textContent = response.errorCount || 0;
      elements.healthReconnects.textContent = response.reconnectCount || 0;

      // Color code errors and reconnects
      elements.healthErrors.style.color = response.errorCount > 0 ? 'var(--color-error)' : '';
      elements.healthReconnects.style.color = response.reconnectCount > 0 ? 'var(--color-warning)' : '';
    }
  } catch (error) {
    console.warn('[Popup] Failed to get health metrics:', error);
  }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  if (!seconds) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format audio level (RMS)
 */
function formatAudioLevel(rms) {
  if (!rms || rms <= 0) {
    return getMessage('audioStatusNoAudio');
  }

  const db = 20 * Math.log10(rms);
  if (db > -40) {
    return getMessage('audioStatusGood');
  } else if (db > -60) {
    return getMessage('audioStatusWeak');
  } else {
    return getMessage('audioStatusNoAudio');
  }
}

/**
 * Get color for ping latency
 */
function getPingColor(ping) {
  if (!ping) return 'var(--color-text-tertiary)';
  if (ping < 200) return 'var(--color-success)';
  if (ping < 500) return 'var(--color-warning)';
  return 'var(--color-error)';
}

/**
 * Get color for RMS audio level
 */
function getRMSColor(rms) {
  if (!rms || rms <= 0) return 'var(--color-text-tertiary)';

  const db = 20 * Math.log10(rms);
  if (db > -40) return 'var(--color-success)';
  if (db > -60) return 'var(--color-warning)';
  return 'var(--color-error)';
}

/**
 * Handle settings changes
 */
async function handleFontSizeChange(e) {
  const value = e.target.value;
  elements.fontSizeValue.textContent = `${value}px`;
  await configManager.saveUserPreferences({ subtitleFontSize: parseInt(value) });
}

async function handleOpacityChange(e) {
  const value = e.target.value;
  elements.opacityValue.textContent = `${value}%`;
  await configManager.saveUserPreferences({ subtitleOpacity: value / 100 });
}

async function handlePositionChange(e) {
  await configManager.saveUserPreferences({ subtitlePosition: e.target.value });
}

async function handleDisplayModeChange(e) {
  await configManager.saveUserPreferences({ displayMode: e.target.value });
}

/**
 * Handle storage changes (sync settings across tabs)
 */
function handleStorageChanges(changes) {
  if (changes.subtitleFontSize) {
    elements.fontSizeRange.value = changes.subtitleFontSize.newValue;
    elements.fontSizeValue.textContent = `${changes.subtitleFontSize.newValue}px`;
  }

  if (changes.subtitleOpacity) {
    const opacity = changes.subtitleOpacity.newValue * 100;
    elements.opacityRange.value = opacity;
    elements.opacityValue.textContent = `${opacity}%`;
  }

  if (changes.subtitlePosition) {
    elements.positionSelect.value = changes.subtitlePosition.newValue;
  }

  if (changes.displayMode) {
    elements.displayModeSelect.value = changes.displayMode.newValue;
  }
}

/**
 * Load translation history
 */
async function loadHistory() {
  try {
    const { transcript_history } = await chrome.storage.local.get('transcript_history');

    if (!transcript_history || transcript_history.length === 0) {
      elements.historyList.innerHTML = `
        <div class="text-center text-tertiary" data-i18n="historyEmpty">
          ${getMessage('historyEmpty')}
        </div>
      `;
      return;
    }

    // Display last 40 items (matching Swift)
    const items = transcript_history.slice(-40).reverse();

    elements.historyList.innerHTML = items.map(item => `
      <div class="history-item">
        ${item.source ? `<div class="history-source">${item.source}</div>` : ''}
        ${item.target ? `<div class="history-target">${item.target}</div>` : ''}
      </div>
    `).join('');

  } catch (error) {
    console.warn('[Popup] Failed to load history:', error);
  }
}

/**
 * Clear translation history
 */
async function handleClearHistory() {
  try {
    await chrome.storage.local.remove('transcript_history');
    await loadHistory();
  } catch (error) {
    console.warn('[Popup] Failed to clear history:', error);
  }
}

/**
 * Handle language change
 */
async function handleLanguageChange(lang) {
  state.currentLanguage = lang;
  await setUILanguage(lang);
  await configManager.saveUserPreferences({ uiLanguage: lang });
}

/**
 * Set UI language
 */
async function setUILanguage(lang) {
  // Update language buttons
  elements.langButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Update all i18n elements
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.textContent = getMessage(key, lang);
  });

  state.currentLanguage = lang;
}

/**
 * Detect user language
 */
function detectUserLanguage() {
  const browserLang = navigator.language || 'en';
  return browserLang.startsWith('zh') ? 'zh_CN' : 'en';
}

/**
 * Get localized message
 */
function getMessage(key, lang = state.currentLanguage) {
  // Use Chrome's i18n API
  return chrome.i18n.getMessage(key) || key;
}

/**
 * Show error message
 */
function showError(messageKey) {
  // You can implement a toast/notification system here
  console.error('[Popup] Error:', getMessage(messageKey));
  updateStatus('error');
}

/**
 * Get current session info
 */
async function getSessionInfo() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-session' });
    return response;
  } catch (error) {
    console.warn('[Popup] Failed to get session:', error);
    return null;
  }
}