const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');
const appKeyEl = $('#appKey');
const accessKeyEl = $('#accessKey');
const resourceIdEl = $('#resourceId');
const workerURLEl = $('#workerURL');
const sourceLangEl = $('#sourceLang');
const targetLangEl = $('#targetLang');

function setStatus(text) {
  statusEl.textContent = text;
}

async function prepareOffscreen() {
  setStatus('准备中…');
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'prepare-offscreen' });
    if (resp?.ok) setStatus('✅ Offscreen已就绪'); else setStatus('❌ Offscreen初始化失败');
  } catch (e) {
    setStatus(`❌ 准备失败: ${e.message || '未知错误'}`);
  }
}

async function check() {
  try {
    const pong = await chrome.runtime.sendMessage({ type: 'ping' });
    setStatus(pong?.ok ? '✅ 连接正常' : '❌ 无响应');
  } catch (e) {
    setStatus(`❌ 检查失败: ${e.message || '服务未响应'}`);
  }
}

async function startCurrentTab() {
  setStatus('启动中…');
  try {
    // Ensure offscreen exists
    const prep = await chrome.runtime.sendMessage({ type: 'prepare-offscreen' });
    if (!prep?.ok) throw new Error('Offscreen初始化失败');

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('未找到活动标签页');

    // Auto-inject subtitle script (mirrors Swift's subtitle window auto-creation)
    try {
      await chrome.runtime.sendMessage({ type: 'inject-subtitle-script' });
    } catch (e) {
      console.warn('[BabelAI] Subtitle script injection failed (may already exist):', e);
    }

    // Acquire streamId for tab audio
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id, consumerTabId: tab.id });
    const resp = await chrome.runtime.sendMessage({ type: 'start-capture', streamId });
    if (resp?.ok) setStatus('✅ 正在捕获音频'); else setStatus('❌ 启动失败');
  } catch (e) {
    setStatus(`❌ 启动失败: ${e.message || '未知错误'}`);
  }
}

async function stopCapture() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'stop-capture' });
    setStatus(resp?.ok ? '✅ 已停止' : '❌ 停止失败');
    // Clear any on-page subtitle overlay
    await chrome.runtime.sendMessage({ type: 'subtitle-clear' }).catch(() => {});
  } catch (e) {
    setStatus(`❌ 停止失败: ${e.message || '未知错误'}`);
  }
}

async function saveConfig() {
  // Validation (mirrors Swift's input validation patterns)
  const appKey = appKeyEl.value?.trim() || '';
  const accessKey = accessKeyEl.value?.trim() || '';
  const resourceId = resourceIdEl.value?.trim() || 'volc.service_type.10053';
  const workerURL = workerURLEl.value?.trim() || '';

  // Validate required fields
  if (!appKey) {
    setStatus('❌ API_APP_KEY不能为空');
    return;
  }
  if (!accessKey) {
    setStatus('❌ API_ACCESS_KEY不能为空');
    return;
  }
  if (!workerURL) {
    setStatus('❌ Worker URL不能为空');
    return;
  }

  // Validate Worker URL format
  if (!workerURL.startsWith('wss://') && !workerURL.startsWith('ws://')) {
    setStatus('❌ Worker URL必须以wss://或ws://开头');
    return;
  }

  // Check for placeholder URL
  if (workerURL.includes('YOUR-SUBDOMAIN') || workerURL.includes('YOUR.workers.dev')) {
    setStatus('❌ 请替换占位符为实际Worker URL');
    return;
  }

  // Validate API key format (basic check: non-empty, reasonable length)
  if (appKey.length < 10) {
    setStatus('❌ API_APP_KEY格式可能不正确（太短）');
    return;
  }
  if (accessKey.length < 10) {
    setStatus('❌ API_ACCESS_KEY格式可能不正确（太短）');
    return;
  }

  const cfg = {
    appKey,
    accessKey,
    resourceId,
    workerURL,
    sourceLanguage: sourceLangEl.value || 'zh',
    targetLanguage: targetLangEl.value || 'en'
  };
  await chrome.storage.sync.set({ babelai_cfg: cfg });
  setStatus('✅ 配置已保存');
}

async function loadConfig() {
  const { babelai_cfg } = await chrome.storage.sync.get('babelai_cfg');
  if (babelai_cfg) {
    appKeyEl.value = babelai_cfg.appKey || '';
    accessKeyEl.value = babelai_cfg.accessKey || '';
    resourceIdEl.value = babelai_cfg.resourceId || 'volc.service_type.10053';
    workerURLEl.value = babelai_cfg.workerURL || '';
    sourceLangEl.value = babelai_cfg.sourceLanguage || 'zh';
    targetLangEl.value = babelai_cfg.targetLanguage || 'en';
    setStatus('Config loaded');
  } else {
    setStatus('No config');
  }
}

$('#btnPrepare').addEventListener('click', prepareOffscreen);
$('#btnCheck').addEventListener('click', check);
$('#btnStart').addEventListener('click', startCurrentTab);
$('#btnStop').addEventListener('click', stopCapture);
$('#btnDemo').addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'inject-subtitle-script' });
    await chrome.runtime.sendMessage({ type: 'demo-subtitle' });
    setStatus('Demo sent');
  } catch { setStatus('Demo failed'); }
});
$('#btnSaveCfg').addEventListener('click', saveConfig);
$('#btnLoadCfg').addEventListener('click', loadConfig);
$('#btnOpenGuide').addEventListener('click', () => {
  // Optional: open repo docs if available in distribution context
  chrome.tabs.create({ url: 'https://developer.chrome.com/docs/extensions/mv3/' });
});

// Subtitle Configuration (mirrors Swift Preferences)
const fontSizeEl = $('#subtitleFontSize');
const opacityEl = $('#subtitleOpacity');
const displayModeEl = $('#displayMode');
const fontSizeValueEl = $('#fontSizeValue');
const opacityValueEl = $('#opacityValue');

// Update value displays
fontSizeEl.addEventListener('input', () => {
  fontSizeValueEl.textContent = `${fontSizeEl.value}px`;
});
opacityEl.addEventListener('input', () => {
  opacityValueEl.textContent = (parseInt(opacityEl.value) / 100).toFixed(2);
});

async function saveSubtitleConfig() {
  const config = {
    fontSize: parseInt(fontSizeEl.value),
    opacity: parseInt(opacityEl.value) / 100,
    displayMode: displayModeEl.value
  };
  await chrome.storage.sync.set({ subtitle_config: config });
  setStatus('字幕配置已保存');
}

async function loadSubtitleConfig() {
  const { subtitle_config } = await chrome.storage.sync.get('subtitle_config');
  if (subtitle_config) {
    fontSizeEl.value = subtitle_config.fontSize || 16;
    opacityEl.value = Math.round((subtitle_config.opacity || 0.95) * 100);
    displayModeEl.value = subtitle_config.displayMode || 'both';
    fontSizeValueEl.textContent = `${fontSizeEl.value}px`;
    opacityValueEl.textContent = (parseInt(opacityEl.value) / 100).toFixed(2);
  }
}

// Subtitle History (mirrors Swift SubtitleView)
async function loadHistory() {
  const { transcript_history } = await chrome.storage.local.get('transcript_history');
  const list = $('#historyList');
  if (!transcript_history || transcript_history.length === 0) {
    list.innerHTML = '<div style="color:#999;padding:8px">暂无历史记录</div>';
    return;
  }
  // Display last 40 items in reverse order (newest first, same as Swift)
  list.innerHTML = transcript_history.slice(-40).reverse().map(item => `
    <div style="padding:6px;border-bottom:1px solid #eee">
      ${item.source ? `<div style="color:#666;font-size:11px">${item.source}</div>` : ''}
      ${item.target ? `<div style="color:#333;font-weight:600;margin-top:2px">${item.target}</div>` : ''}
    </div>
  `).join('');
}

async function clearHistory() {
  await chrome.runtime.sendMessage({ type: 'clear-history' });
  await loadHistory();
  setStatus('历史已清空');
}

// Event listeners
$('#btnSaveSubtitleConfig').addEventListener('click', saveSubtitleConfig);
$('#btnRefreshHistory').addEventListener('click', loadHistory);
$('#btnClearHistory').addEventListener('click', clearHistory);

// Listen for error messages from offscreen
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'error' && message.message) {
    setStatus(`❌ ${message.message}`);
  }
});

// Auto-load config on open
loadConfig().catch(() => {});
loadSubtitleConfig().catch(() => {});
loadHistory().catch(() => {});

// Health Monitoring (mirrors Swift HealthView)
let healthAutoRefresh = null;

// Format uptime (mirrors Swift formatUptime)
function formatUptime(seconds) {
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

// Get color for ping (mirrors Swift pingColor)
function getPingColor(ping) {
  if (ping < 50) return '#22c55e';      // green (Swift: success)
  if (ping < 150) return '#f59e0b';     // yellow (Swift: warning)
  return '#ef4444';                     // red (Swift: error)
}

// Get color for queue (mirrors Swift queueColor)
function getQueueColor(size) {
  if (size < 50) return '#22c55e';
  if (size < 150) return '#f59e0b';
  return '#ef4444';
}

// Get color for error count (mirrors Swift errorCountColor)
function getErrorColor(count) {
  if (count === 0) return '#22c55e';
  if (count < 3) return '#f59e0b';
  return '#ef4444';
}

// Get color for reconnect count (mirrors Swift reconnectColor)
function getReconnectColor(count) {
  if (count === 0) return '#22c55e';
  if (count < 2) return '#f59e0b';
  return '#ef4444';
}

// Get color for RMS audio level (mirrors Swift levelBarColor)
function getRMSColor(rms) {
  if (rms <= 0) return '#999';  // No audio - gray
  const db = 20 * Math.log10(rms);
  // Swift MainView.swift:369-373 color logic
  if (db > -40) return '#22c55e';  // Green: good level
  if (db > -60) return '#f59e0b';  // Yellow: moderate level
  return '#ef4444';                // Red: low level
}

// Format RMS as decibels (mirrors Swift formatDecibels)
function formatDecibels(rms) {
  if (!rms || rms <= 0) return '-∞ dB';
  const db = 20 * Math.log10(rms);
  return db.toFixed(1) + ' dB';
}

// Get overall health status (mirrors Swift overallHealthStatus)
function getOverallHealthStatus(errorCount, reconnectCount) {
  if (errorCount > 5 || reconnectCount > 3) {
    return { text: '需要关注', color: '#ef4444' };
  } else if (errorCount > 2 || reconnectCount > 1) {
    return { text: '运行正常', color: '#f59e0b' };
  } else {
    return { text: '状态良好', color: '#22c55e' };
  }
}

async function refreshHealth() {
  try {
    const h = await chrome.runtime.sendMessage({ type: 'get-health' });
    if (h?.ok) {
      // Update overall status
      const status = getOverallHealthStatus(h.errorCount || 0, h.reconnectCount || 0);
      $('#healthStatus').textContent = status.text;
      $('#healthIndicator').style.backgroundColor = status.color;

      // Update metrics
      $('#healthUptime').textContent = formatUptime(h.uptime || 0);
      $('#healthPing').textContent = `${(h.avgPingMs || 0).toFixed(1)}ms`;
      $('#healthPing').style.color = getPingColor(h.avgPingMs || 0);

      // Update RMS audio level (mirrors Swift MainView.swift:128)
      const rms = h.avgRMS || h.currentRMS || 0;
      $('#healthRMS').textContent = formatDecibels(rms);
      $('#healthRMS').style.color = getRMSColor(rms);

      $('#healthQueue').textContent = h.queueSize || 0;
      $('#healthQueue').style.color = getQueueColor(h.queueSize || 0);

      $('#healthEvents').textContent = h.wsEvents || 0;

      $('#healthErrors').textContent = h.errorCount || 0;
      $('#healthErrors').style.color = getErrorColor(h.errorCount || 0);

      $('#healthReconnects').textContent = h.reconnectCount || 0;
      $('#healthReconnects').style.color = getReconnectColor(h.reconnectCount || 0);

      setStatus(`健康状态: ${status.text}`);
    } else {
      setStatus('无法获取健康状态');
    }
  } catch (e) {
    setStatus('健康检查失败');
  }
}

// Old health button (for backward compatibility)
$('#btnHealth').addEventListener('click', refreshHealth);

// New health monitoring buttons
$('#btnHealthRefresh').addEventListener('click', refreshHealth);

$('#btnHealthAuto').addEventListener('click', () => {
  if (healthAutoRefresh) {
    clearInterval(healthAutoRefresh);
    healthAutoRefresh = null;
    $('#btnHealthAuto').textContent = '自动刷新';
    setStatus('停止自动刷新');
  } else {
    healthAutoRefresh = setInterval(refreshHealth, 2000);  // Refresh every 2s
    $('#btnHealthAuto').textContent = '停止刷新';
    setStatus('开始自动刷新');
    refreshHealth();  // Immediate first refresh
  }
});
