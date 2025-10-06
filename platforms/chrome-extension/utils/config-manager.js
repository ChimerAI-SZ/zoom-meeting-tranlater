/**
 * Configuration Manager for BabelAI Chrome Extension
 * Handles API credentials securely without user input
 */

class ConfigManager {
  constructor() {
    this.config = null;
    this.defaultConfig = {
      sourceLanguage: 'auto', // Auto-detect
      targetLanguage: 'en',
      subtitleFontSize: 16,
      subtitleOpacity: 0.95,
      subtitlePosition: 'bottom-center',
      displayMode: 'both'
    };
  }

  /**
   * Initialize configuration
   * Load API credentials from storage or use demo mode
   */
  async initialize() {
    try {
      // Start with default config
      this.config = { ...this.defaultConfig };

      // Try to load API credentials from storage (for development)
      const stored = await chrome.storage.local.get(['api_config']);
      if (stored.api_config) {
        Object.assign(this.config, stored.api_config);
        console.log('[ConfigManager] Loaded API configuration from storage');
      } else {
        // For production, you would include encrypted credentials here
        // For now, use demo mode
        this.config.demoMode = true;
        console.log('[ConfigManager] Running in demo mode (no API credentials)');

        // In production, you could decrypt built-in credentials like:
        // this.config = {
        //   ...this.defaultConfig,
        //   API_APP_KEY: decrypt('encrypted_key_here'),
        //   API_ACCESS_KEY: decrypt('encrypted_access_key_here'),
        //   ...
        // };
      }

      // Load user preferences (UI settings only)
      await this.loadUserPreferences();

      return true;
    } catch (error) {
      console.error('[ConfigManager] Failed to initialize:', error);

      // Use demo mode if initialization fails
      this.config = {
        ...this.defaultConfig,
        demoMode: true
      };

      return false;
    }
  }

  /**
   * Load development configuration from .env or storage
   * Only for development, not exposed to end users
   */
  async loadDevelopmentConfig() {
    try {
      // Check if running in development mode
      const manifest = chrome.runtime.getManifest();
      if (manifest.update_url) {
        // This is a production build from Chrome Web Store
        throw new Error('No built-in credentials found');
      }

      // Development mode - check local storage for dev credentials
      const stored = await chrome.storage.local.get(['dev_api_config']);
      if (stored.dev_api_config) {
        this.config = {
          ...this.defaultConfig,
          ...stored.dev_api_config
        };
        console.log('[ConfigManager] Loaded development configuration');
      }
    } catch (error) {
      console.warn('[ConfigManager] No development config available');
    }
  }

  /**
   * Load user preferences (UI settings only, no API keys)
   */
  async loadUserPreferences() {
    try {
      const stored = await chrome.storage.sync.get([
        'sourceLanguage',
        'targetLanguage',
        'subtitleFontSize',
        'subtitleOpacity',
        'subtitlePosition',
        'displayMode',
        'uiLanguage'
      ]);

      if (stored) {
        Object.assign(this.config, stored);
      }
    } catch (error) {
      console.warn('[ConfigManager] Failed to load user preferences:', error);
    }
  }

  /**
   * Save user preferences (UI settings only, never API keys)
   */
  async saveUserPreferences(preferences) {
    try {
      // Filter out any API-related keys for safety
      const safePrefs = {};
      const allowedKeys = [
        'sourceLanguage',
        'targetLanguage',
        'subtitleFontSize',
        'subtitleOpacity',
        'subtitlePosition',
        'displayMode',
        'uiLanguage'
      ];

      for (const key of allowedKeys) {
        if (preferences[key] !== undefined) {
          safePrefs[key] = preferences[key];
          this.config[key] = preferences[key];
        }
      }

      await chrome.storage.sync.set(safePrefs);
      console.log('[ConfigManager] User preferences saved');

      return true;
    } catch (error) {
      console.error('[ConfigManager] Failed to save preferences:', error);
      return false;
    }
  }

  /**
   * Get API credentials for WebSocket connection
   * Returns null if in demo mode or no credentials available
   */
  getAPICredentials() {
    if (this.config?.demoMode) {
      return null;
    }

    if (!this.config?.API_APP_KEY || !this.config?.API_ACCESS_KEY) {
      return null;
    }

    return {
      appKey: this.config.API_APP_KEY,
      accessKey: this.config.API_ACCESS_KEY,
      resourceId: this.config.API_RESOURCE_ID || 'volc.service_type.10053',
      workerUrl: this.config.WORKER_URL
    };
  }

  /**
   * Get WebSocket URL (direct or through worker proxy)
   */
  getWebSocketURL() {
    if (this.config?.WORKER_URL) {
      return this.config.WORKER_URL;
    }

    // Default to direct connection (requires CORS headers)
    return 'wss://openspeech.bytedance.com/api/v4/ast/v2/translate';
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Check if running in demo mode
   */
  isDemoMode() {
    return this.config?.demoMode === true;
  }

  /**
   * Auto-detect source language based on page content
   */
  async detectSourceLanguage() {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return 'auto';

      // Try to detect language from page
      const result = await chrome.tabs.detectLanguage(tab.id);

      // Map browser language codes to our supported languages
      const languageMap = {
        'zh': 'zh',
        'zh-CN': 'zh',
        'zh-TW': 'zh',
        'en': 'en',
        'en-US': 'en',
        'en-GB': 'en',
        'ja': 'ja',
        'ko': 'ko',
        'es': 'es',
        'fr': 'fr',
        'de': 'de',
        'ru': 'ru'
      };

      return languageMap[result] || 'auto';
    } catch (error) {
      console.warn('[ConfigManager] Failed to detect language:', error);
      return 'auto';
    }
  }

  /**
   * Get target language based on source
   */
  getTargetLanguage(sourceLanguage) {
    // Smart language pairing
    const pairs = {
      'zh': 'en',  // Chinese -> English
      'en': 'zh',  // English -> Chinese
      'ja': 'en',  // Japanese -> English
      'ko': 'en',  // Korean -> English
      'es': 'en',  // Spanish -> English
      'fr': 'en',  // French -> English
      'de': 'en',  // German -> English
      'ru': 'en',  // Russian -> English
    };

    return pairs[sourceLanguage] || 'en';
  }
}

// Export singleton instance
const configManager = new ConfigManager();
export default configManager;