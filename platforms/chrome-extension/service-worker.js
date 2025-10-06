// BabelAI Chrome Extension (MVP)
// Manifest V3 Service Worker — base scaffolding

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const OFFSCREEN_REASON = 'USER_MEDIA'; // aligns with audio capture use

// Keep a simple state in memory (service worker may still suspend)
let offscreenReady = false;

// Utility: ensure an offscreen document exists
async function ensureOffscreenDocument() {
  // chrome.offscreen has experimental hasDocument() in newer Chrome; guard for compatibility
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const has = await chrome.offscreen.hasDocument();
    if (has) return true;
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [OFFSCREEN_REASON],
      justification: 'Audio processing for real-time translation (MVP)'
    });
    return true;
  } catch (e) {
    // If already exists, treat as success
    if (String(e).includes('Only a single offscreen document is supported')) {
      return true;
    }
    console.warn('[BabelAI] Failed to create offscreen document:', e);
    return false;
  }
}

// Basic keepalive via alarms (does not guarantee persistence, but provides periodic triggers)
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.alarms.create('babel_keepalive', { periodInMinutes: 0.33 }); // ~20s
  } catch (e) {
    console.warn('[BabelAI] Failed to create keepalive alarm:', e);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'babel_keepalive') return;
  // Soft ping offscreen to keep the pipeline warm
  chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {});
});

// Popup action (toolbar click) optional fallback
chrome.action.onClicked?.addListener(async (tab) => {
  // In MVP we rely on popup UI; this is a no-op placeholder
  console.debug('[BabelAI] action clicked on tab', tab?.id);
});

// Message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'prepare-offscreen': {
        const ok = await ensureOffscreenDocument();
        offscreenReady = ok;
        sendResponse({ ok, offscreenReady });
        break;
      }
      case 'start-capture': {
        // Ensure offscreen exists then forward start with streamId
        const ok = await ensureOffscreenDocument();
        if (ok) {
          offscreenReady = true;
          chrome.runtime.sendMessage({ type: 'start-capture', streamId: message.streamId }).catch(() => {});
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'offscreen-create-failed' });
        }
        break;
      }
      case 'stop-capture': {
        if (offscreenReady) {
          chrome.runtime.sendMessage({ type: 'stop-capture' }).catch(() => {});
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'offscreen-not-ready' });
        }
        break;
      }
      case 'offscreen-ready': {
        offscreenReady = true;
        sendResponse({ ok: true });
        break;
      }
      case 'ping': {
        // noop ack
        sendResponse({ ok: true });
        break;
      }
      case 'get-health': {
        // Bridge request to offscreen with timeout protection
        let responded = false;
        const timeout = setTimeout(() => {
          if (!responded) {
            responded = true;
            sendResponse({ ok: false, error: 'health-timeout' });
          }
        }, 5000); // 5 second timeout

        const onHealth = (msg) => {
          if (msg && msg.type === 'health-response' && !responded) {
            responded = true;
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(onHealth);
            sendResponse(msg.data || { ok: false });
          }
        };

        chrome.runtime.onMessage.addListener(onHealth);
        chrome.runtime.sendMessage({ type: 'get-health' }).catch(() => {
          if (!responded) {
            responded = true;
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(onHealth);
            sendResponse({ ok: false, error: 'offscreen-no-reply' });
          }
        });
        return true;
      }
      case 'inject-subtitle-script': {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) return sendResponse({ ok: false, error: 'no-active-tab' });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['content/subtitle.js']
          });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }
      case 'subtitle-update': {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) await chrome.tabs.sendMessage(tab.id, {
            type: 'subtitle',
            source: message.source || '',
            translation: message.translation || ''
          });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }
      case 'subtitle-clear': {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'subtitle-clear' });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }
      case 'demo-subtitle': {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content/subtitle.js'] });
            await chrome.tabs.sendMessage(tab.id, {
              type: 'subtitle',
              source: '这是一个示例原文句子',
              translation: 'This is a sample translated sentence.'
            });
          }
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }
      default: {
        // Forward unrecognized messages to offscreen if available
        if (offscreenReady) {
          chrome.runtime.sendMessage(message).catch(() => {});
          sendResponse({ forwarded: true });
        } else {
          sendResponse({ forwarded: false, error: 'offscreen-not-ready' });
        }
      }
    }
  })();
  return true; // async sendResponse
});
