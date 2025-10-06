/**
 * Development Setup Script
 * Run this in Chrome DevTools Console to configure API credentials for testing
 *
 * Usage:
 * 1. Load the extension in Chrome
 * 2. Open the extension's background page (Service Worker)
 * 3. Open DevTools Console
 * 4. Paste and run this script with your actual API credentials
 */

// Replace with your actual API credentials
const API_CONFIG = {
  API_APP_KEY: 'YOUR_APP_KEY_HERE',
  API_ACCESS_KEY: 'YOUR_ACCESS_KEY_HERE',
  API_RESOURCE_ID: 'volc.service_type.10053',
  WORKER_URL: 'wss://babelai-ws.YOUR_DOMAIN.workers.dev'
};

// Save to Chrome storage
chrome.storage.local.set({ api_config: API_CONFIG }, () => {
  console.log('✅ API configuration saved successfully!');
  console.log('You can now use the extension with your API credentials.');
  console.log('To clear: chrome.storage.local.remove("api_config")');
});

// To verify:
chrome.storage.local.get(['api_config'], (result) => {
  console.log('Current config:', result.api_config);
});