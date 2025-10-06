// Subtitle overlay with configurable styles (mirrors Swift SubtitleView)
// Supports: fontSize, opacity, displayMode configuration

// Debug mode (set to false in production)
const DEBUG_SUBTITLE = false;

(() => {
  const state = { el: null, mode: 'fixed', lastPlacement: 0 };

  // Subtitle configuration (mirrors Swift Preferences)
  let subtitleConfig = {
    fontSize: 16,        // 12-24px (default 16)
    opacity: 0.95,       // 0.3-1.0 (Swift default: 0.95)
    position: 'auto',    // 'auto'|'bottom-center'
    displayMode: 'both'  // 'both'|'source'|'translation'
  };

  function findPrimaryVideo() {
    const vids = Array.from(document.querySelectorAll('video'))
      .filter(v => v.videoWidth > 0 && v.videoHeight > 0 && v.offsetWidth > 0 && v.offsetHeight > 0);
    if (vids.length === 0) return null;
    // pick the largest visible video
    return vids.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
  }

  function ensureOverlay() {
    if (state.el) return state.el;
    const el = document.createElement('div');
    el.id = 'babelai-subtitle';
    const inner = document.createElement('div');
    inner.style.transition = 'opacity 120ms ease-in-out';
    el.appendChild(inner);
    // Initial styles (will be updated by applyConfig)
    Object.assign(el.style, {
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: '8%',
      zIndex: 2147483647,
      maxWidth: '70%',
      background: `rgba(0,0,0,${subtitleConfig.opacity})`,
      color: '#fff',
      padding: '10px 12px',
      borderRadius: '10px',
      fontSize: `${subtitleConfig.fontSize}px`,
      lineHeight: 1.45,
      boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      pointerEvents: 'none',
      opacity: '0'
    });
    document.documentElement.appendChild(el);
    state.el = el;
    return el;
  }

  function placeOverlay() {
    const el = ensureOverlay();
    if (!el) return;
    // recompute at most every 200ms
    const now = performance.now();
    if (now - state.lastPlacement < 200) return;
    state.lastPlacement = now;

    const vid = findPrimaryVideo();
    if (vid) {
      const rect = vid.getBoundingClientRect();
      Object.assign(el.style, {
        position: 'fixed',
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
        bottom: `${Math.max(8, window.innerHeight - rect.bottom + 12)}px`
      });
      state.mode = 'video';
    } else {
      Object.assign(el.style, {
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '8%'
      });
      state.mode = 'fixed';
    }
  }

  function updateSubtitle(source, translation) {
    const el = ensureOverlay();
    const inner = el.firstChild;
    const safe = (t) => (t || '').toString().replace(/[<>]/g, '');

    // Apply displayMode (mirrors Swift TranscriptItemView)
    let html = '';
    if (subtitleConfig.displayMode === 'both') {
      html = `
        <div style="opacity:0.9">${safe(source)}</div>
        <div style="opacity:1;font-weight:600;margin-top:4px">${safe(translation)}</div>
      `;
    } else if (subtitleConfig.displayMode === 'source') {
      html = `<div style="opacity:1">${safe(source)}</div>`;
    } else if (subtitleConfig.displayMode === 'translation') {
      html = `<div style="opacity:1;font-weight:600">${safe(translation)}</div>`;
    }

    inner.innerHTML = html;
    placeOverlay();
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  }

  function clearSubtitle() {
    if (state.el) state.el.style.opacity = '0';
  }

  // Load configuration from storage (mirrors Swift Preferences)
  async function loadConfig() {
    try {
      const { subtitle_config } = await chrome.storage.sync.get('subtitle_config');
      if (subtitle_config) {
        subtitleConfig = { ...subtitleConfig, ...subtitle_config };
        applyConfig();
      }
    } catch (e) {
      if (DEBUG_SUBTITLE) console.warn('[Subtitle] Failed to load config:', e);
    }
  }

  // Apply configuration to overlay
  function applyConfig() {
    if (!state.el) return;
    state.el.style.fontSize = `${subtitleConfig.fontSize}px`;
    state.el.style.background = `rgba(0,0,0,${subtitleConfig.opacity})`;
  }

  // Listen for configuration changes
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.subtitle_config) {
        subtitleConfig = { ...subtitleConfig, ...changes.subtitle_config.newValue };
        applyConfig();
      }
    });
  } catch {}

  // auto placement updates on resize/scroll
  window.addEventListener('resize', placeOverlay, { passive: true });
  window.addEventListener('scroll', placeOverlay, { passive: true });
  document.addEventListener('fullscreenchange', placeOverlay, { passive: true });

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'subtitle') {
        updateSubtitle(message.source || '', message.translation || '');
      } else if (message?.type === 'subtitle-clear') {
        clearSubtitle();
      }
    });
  } catch {}

  // Load config on initialization
  loadConfig();
})();
