// Offscreen audio processing (MVP scaffold)
import { encodeStartSession, encodeAudioChunk, decodeTranslateResponse, Events } from './wirecodec.js';
import { TTSPlayer } from './tts_player.js';
// Mirrors Swift app's audio chain constraints:
// - Target sample rate: 16000 Hz
// - Single channel (mono)
// - 80ms framing will be implemented in subsequent steps

let audioContext = null;
let sourceNode = null;
let workletNode = null;
let mediaStream = null;
let ready = false;

// TTS Player (48kHz playback, mirrors Swift AudioPlayer)
let ttsPlayer = null;

// Transcript History (mirrors Swift TranscriptModel)
const transcriptHistory = {
  items: [],
  maxItems: 200,  // Same as Swift

  add(source, target) {
    const item = {
      id: Date.now(),
      source: (source || '').trim(),
      target: (target || '').trim(),
      timestamp: new Date().toISOString()
    };
    if (!item.source && !item.target) return;

    this.items.push(item);
    if (this.items.length > this.maxItems) {
      this.items.shift();  // Remove oldest (Swift: items.removeFirst)
    }
    this.save();
  },

  async save() {
    try {
      // Save last 200 items to storage (Swift stores 200, shows last 40)
      await chrome.storage.local.set({
        transcript_history: this.items.slice(-200)
      });
    } catch (e) {
      console.warn('[History] Save failed:', e);
    }
  },

  async load() {
    try {
      const { transcript_history } = await chrome.storage.local.get('transcript_history');
      if (transcript_history) {
        this.items = transcript_history;
      }
    } catch (e) {
      console.warn('[History] Load failed:', e);
    }
  },

  clear() {
    this.items = [];
    chrome.storage.local.remove('transcript_history');
  }
};

// WS manager state
let ws = null;
let wsSession = {
  state: 'idle', // idle|connecting|connected|reconnecting|error
  reconnectAttempts: 0,
  lastRealAudioTime: 0,
  queue: [],
  maxQueue: 300,
  frameIntervalMs: 80,
  sendTimer: null,
  heartbeatTimer: null,
  baseTime: 0,
  frameCount: 0,
  sequence: 0,  // Added sequence number tracking
  cfg: null,
  startTime: 0,  // Track session start time
  // health metrics (mirrors Swift HealthMetrics)
  metrics: {
    framesSent: 0,
    lastSendTs: 0,
    avgIntervalMs: 0,
    intervalSamples: 0,
    queueDrops: 0,
    avgQueue: 0,
    queueSamples: 0,
    errorCount: 0,      // Error counter (Swift: errorCount)
    wsEvents: 0,        // WebSocket event counter (Swift: wsEvents)
    avgPingMs: 0,       // Average ping in ms (Swift: avgPingMs)
    pingSamples: [],    // Ping samples for averaging
    queueEMA: 0,        // Queue exponential moving average (Swift uses this)
    currentRMS: 0,      // Current RMS audio level (Swift: inputLevelRMS)
    avgRMS: 0,          // Average RMS for smoothing
    rmsSamples: []      // RMS samples for averaging (last 20)
  }
};

async function initAudioContext() {
  if (audioContext) return audioContext;
  audioContext = new (self.AudioContext || self.webkitAudioContext)({ sampleRate: 16000 });
  // Keep audio graph alive by connecting a silent node to destination
  const silent = audioContext.createGain();
  silent.gain.value = 0.0;
  silent.connect(audioContext.destination);
  if (audioContext.state === 'suspended') {
    try { await audioContext.resume(); } catch {}
  }
  return audioContext;
}

async function handlePrepare() {
  await initAudioContext();

  // Initialize TTS Player (48kHz, mirrors Swift AudioPlayer)
  if (!ttsPlayer) {
    ttsPlayer = new TTSPlayer();
    await ttsPlayer.start();
  }

  ready = true;
  // Notify SW we are ready
  chrome.runtime.sendMessage({ type: 'offscreen-ready' }).catch(() => {});
  return { ok: true };
}

function computeRMS(pcm16) {
  const view = new Int16Array(pcm16);
  let sum = 0;
  for (let i = 0; i < view.length; i++) {
    const v = view[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, view.length));
}

function ensureQueueCapacity() {
  while (wsSession.queue.length >= wsSession.maxQueue) {
    wsSession.queue.shift();
    wsSession.metrics.queueDrops += 1;
    wsSession.metrics.errorCount += 1;  // Track as error (Swift: recordError)
  }
}

// Health monitoring functions (mirrors Swift HealthMonitor)
function recordError() {
  wsSession.metrics.errorCount += 1;
}

function updateQueueMetrics() {
  const currentQueue = wsSession.queue.length;
  // Exponential moving average (Swift uses 0.7 * old + 0.3 * new)
  if (wsSession.metrics.queueEMA === 0) {
    wsSession.metrics.queueEMA = currentQueue;
  } else {
    wsSession.metrics.queueEMA = 0.7 * wsSession.metrics.queueEMA + 0.3 * currentQueue;
  }
  wsSession.metrics.avgQueue = Math.round(wsSession.metrics.queueEMA);
}

function enqueuePCMFrame(pcm16Buffer) {
  // Track real audio moment
  const rms = computeRMS(pcm16Buffer);
  if (rms > 0.0001) { // ~ -80 dB threshold
    wsSession.lastRealAudioTime = performance.now();
  }

  // Update RMS metrics (mirrors Swift AudioManager.swift:161-162)
  wsSession.metrics.currentRMS = rms;
  wsSession.metrics.rmsSamples.push(rms);
  if (wsSession.metrics.rmsSamples.length > 20) {
    wsSession.metrics.rmsSamples.shift();
  }
  // Calculate average RMS
  const sum = wsSession.metrics.rmsSamples.reduce((a, b) => a + b, 0);
  wsSession.metrics.avgRMS = sum / wsSession.metrics.rmsSamples.length;

  ensureQueueCapacity();
  wsSession.queue.push(pcm16Buffer);
}

function silentFrame() {
  // 80ms * 16k * 2 bytes
  return new ArrayBuffer(1280 * 2);
}

function resetPacing() {
  wsSession.baseTime = performance.now();
  wsSession.frameCount = 0;
}

function startTimers() {
  stopTimers();
  // 80ms scheduler, akin to Swift sendTimer
  wsSession.sendTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    const ideal = wsSession.baseTime + wsSession.frameCount * wsSession.frameIntervalMs;
    const drift = now - ideal;
    if (drift > 500 || drift < -500) {
      // reset pacing if drift too large
      resetPacing();
    }
    let chunk = null;
    if (wsSession.queue.length > 0) {
      chunk = wsSession.queue.shift();
    } else {
      const sinceReal = performance.now() - wsSession.lastRealAudioTime;
      if (sinceReal < 500) {
        chunk = silentFrame();
      } else {
        // skip sending to avoid processing silence
        return;
      }
    }
    try {
      const req = encodeAudioChunk({
        sessionId: wsSession.sessionId,
        pcmBytes: chunk,
        sequence: wsSession.sequence++  // Increment sequence for each audio chunk
      });
      ws.send(req);
      wsSession.frameCount += 1;
      // metrics
      if (wsSession.metrics.lastSendTs > 0) {
        const delta = now - wsSession.metrics.lastSendTs;
        wsSession.metrics.intervalSamples += 1;
        wsSession.metrics.avgIntervalMs += (delta - wsSession.metrics.avgIntervalMs) / wsSession.metrics.intervalSamples;
      }
      wsSession.metrics.lastSendTs = now;
      wsSession.metrics.framesSent += 1;
      updateQueueMetrics();  // Use EMA for queue size
      if (wsSession.frameCount % 50 === 0) {
        // optional log hook
      }
    } catch (e) {
      recordError();
    }
  }, wsSession.frameIntervalMs);

  // Heartbeat with ping measurement (mirrors Swift 30s heartbeat)
  wsSession.heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const pingStart = performance.now();
      wsSession.lastPingStart = pingStart;
      try {
        ws.send('ping');
      } catch (e) {
        recordError();
      }
    }
  }, 30000);
}

function stopTimers() {
  if (wsSession.sendTimer) { clearInterval(wsSession.sendTimer); wsSession.sendTimer = null; }
  if (wsSession.heartbeatTimer) { clearInterval(wsSession.heartbeatTimer); wsSession.heartbeatTimer = null; }
}

function closeWS() {
  try { if (ws) ws.close(); } catch {}
  ws = null;
  stopTimers();
}

async function readConfig() {
  const { babelai_cfg } = await chrome.storage.sync.get('babelai_cfg');
  return babelai_cfg || {
    appKey: '',
    accessKey: '',
    resourceId: 'volc.service_type.10053',
    workerURL: '',
    sourceLanguage: 'zh',
    targetLanguage: 'en'
  };
}

function connectWS(cfg) {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }
  wsSession.state = 'connecting';
  wsSession.cfg = cfg;

  try {
    const connectId = crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

    // Validate Worker URL configuration
    if (!cfg.workerURL || cfg.workerURL.trim() === '') {
      recordError();
      wsSession.state = 'error';
      chrome.runtime.sendMessage({
        type: 'error',
        message: 'Worker URL未配置，请在设置中填写Cloudflare Worker URL'
      }).catch(() => {});
      return;
    }

    const WORKER_URL = cfg.workerURL.trim();

    // Check for placeholder URL
    if (WORKER_URL.includes('YOUR-SUBDOMAIN') || WORKER_URL.includes('YOUR.workers.dev')) {
      recordError();
      wsSession.state = 'error';
      chrome.runtime.sendMessage({
        type: 'error',
        message: 'Worker URL仍为占位符，请部署Worker后填写实际URL'
      }).catch(() => {});
      return;
    }

    // Validate WebSocket URL format
    if (!WORKER_URL.startsWith('wss://') && !WORKER_URL.startsWith('ws://')) {
      recordError();
      wsSession.state = 'error';
      chrome.runtime.sendMessage({
        type: 'error',
        message: 'Worker URL格式错误，必须以wss://或ws://开头'
      }).catch(() => {});
      return;
    }

    // Encode auth in subprotocol (Chrome allows this, unlike custom headers)
    const authData = {
      appKey: cfg.appKey || '',
      accessKey: cfg.accessKey || '',
      resourceId: cfg.resourceId || 'volc.service_type.10053',
      connectId: connectId
    };

    // Base64 encode and remove padding (Chrome doesn't allow '=' in subprotocol)
    const authProtocol = 'auth_' + btoa(JSON.stringify(authData)).replace(/=/g, '');

    // Connect using subprotocol
    ws = new WebSocket(WORKER_URL, [authProtocol]);
    wsSession.sessionId = wsSession.sessionId || (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    wsSession.connectId = connectId;
  } catch (e) {
    wsSession.state = 'error';
    return;
  }

  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    wsSession.state = 'connected';
    wsSession.reconnectAttempts = 0;
    wsSession.sequence = 0;  // Reset sequence number on new connection
    wsSession.startTime = Date.now();  // Track session start time
    resetPacing();
    // Send StartSession (protobuf)
    try {
      const startBuf = encodeStartSession({
        sessionId: wsSession.sessionId,
        connectionId: wsSession.connectId,
        appKey: cfg.appKey,
        resourceId: cfg.resourceId,
        sourceAudio: { format: 'wav', rate: 16000, bits: 16, channel: 1 },
        targetAudio: { format: 'pcm', rate: 48000, channel: 1 }, // 48kHz matching Swift
        mode: 's2s',
        source_language: cfg.sourceLanguage || 'zh',
        target_language: cfg.targetLanguage || 'en',
        denoise: true
      });
      ws.send(startBuf);
    } catch (e) {
      recordError();
    }
    startTimers();
  };

  ws.onclose = () => {
    stopTimers();
    if (wsSession.state !== 'idle') scheduleReconnect();
  };

  ws.onerror = () => {
    stopTimers();
    scheduleReconnect();
  };

  ws.onmessage = (ev) => {
    try {
      // Record WebSocket event (Swift: recordEvent)
      wsSession.metrics.wsEvents += 1;

      // Handle ping response for RTT measurement
      if (typeof ev.data === 'string' && ev.data === 'pong') {
        if (wsSession.lastPingStart) {
          const rtt = performance.now() - wsSession.lastPingStart;
          wsSession.metrics.pingSamples.push(rtt);
          if (wsSession.metrics.pingSamples.length > 50) {
            wsSession.metrics.pingSamples.shift();
          }
          // Calculate average ping (Swift: avgPingMs)
          const sum = wsSession.metrics.pingSamples.reduce((a, b) => a + b, 0);
          wsSession.metrics.avgPingMs = sum / wsSession.metrics.pingSamples.length;
        }
        return;
      }

      const msg = decodeTranslateResponse(ev.data);
      const e = msg.event >>> 0;
      switch (e) {
        case Events.SessionStarted:
          break;
        case Events.AudioMuted:
          break;
        case Events.SourceSubtitleStart:
          wsSession.srcBuf = [];
          break;
        case Events.SourceSubtitleResponse:
          if (msg.text) wsSession.srcBuf.push(msg.text);
          break;
        case Events.SourceSubtitleEnd: {
          const t = (wsSession.srcBuf || []).join('');
          wsSession.srcBuf = [];
          wsSession.currentSource = t;  // Store for history pairing
          if (t) { try { chrome.runtime.sendMessage({ type: 'subtitle-update', source: t, translation: '' }); } catch {} }
          break; }
        case Events.TranslationSubtitleStart:
          wsSession.tgtBuf = [];
          break;
        case Events.TranslationSubtitleResponse:
          if (msg.text) wsSession.tgtBuf.push(msg.text);
          break;
        case Events.TranslationSubtitleEnd: {
          const t = (wsSession.tgtBuf || []).join(' ');
          wsSession.tgtBuf = [];
          // Add to history (mirrors Swift TranscriptModel.append)
          transcriptHistory.add(wsSession.currentSource || '', t);
          wsSession.currentSource = '';  // Clear
          if (t) { try { chrome.runtime.sendMessage({ type: 'subtitle-update', source: '', translation: t }); } catch {} }
          break; }
        case Events.TTSSentenceStart:
          // TTS sentence starting (mirrors Swift .ttssentenceStart)
          break;
        case Events.TTSResponse:
          // TTS audio data - play immediately (mirrors Swift .ttsresponse)
          if (msg.data && msg.data.byteLength > 0 && ttsPlayer) {
            try {
              ttsPlayer.enqueuePCM16(msg.data);
            } catch (e) {
              console.warn('[TTS] playback error:', e);
            }
          }
          break;
        case Events.TTSSentenceEnd:
          // TTS sentence ended (mirrors Swift .ttssentenceEnd)
          break;
        default:
          break;
      }
    } catch (e) {}
  };
}

function scheduleReconnect() {
  wsSession.state = 'reconnecting';
  wsSession.reconnectAttempts += 1;
  const delay = Math.min(Math.pow(2, Math.max(0, wsSession.reconnectAttempts - 1)), 16) * 1000;
  setTimeout(async () => {
    const cfg = await readConfig();
    connectWS(cfg);
  }, delay);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'start-capture':
        if (!ready) await handlePrepare();
        try {
          // Build stream from tab capture streamId
          const gUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          mediaStream = await gUM({
            audio: {
              mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: message.streamId,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              }
            },
            video: false
          });

          // Connect to AudioWorklet for 16k/80ms framing
          await audioContext.audioWorklet.addModule('offscreen/pcm_worklet.js');
          sourceNode = audioContext.createMediaStreamSource(mediaStream);
          workletNode = new AudioWorkletNode(audioContext, 'pcm16k-framer', {
            numberOfInputs: 1,
            numberOfOutputs: 0, // analysis-only
            outputChannelCount: []
          });

          // Keep destination connected via silent gain created in init
          sourceNode.connect(workletNode);

          workletNode.port.onmessage = (ev) => {
            const { type } = ev.data || {};
            if (type === 'frame') {
              // Received one 80ms PCM16 mono frame at 16kHz (ArrayBuffer)
              enqueuePCMFrame(ev.data.pcm16);
            }
          };

          // Connect to backend WS using stored config
          const cfg = await readConfig();
          connectWS(cfg);

          sendResponse({ ok: true });
        } catch (e) {
          console.warn('[BabelAI] start-capture failed:', e);
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      case 'prepare-offscreen':
        sendResponse(await handlePrepare());
        break;
      case 'stop-capture':
        try {
          if (workletNode) { try { workletNode.disconnect(); } catch {} workletNode = null; }
          if (sourceNode) { try { sourceNode.disconnect(); } catch {} sourceNode = null; }
          if (mediaStream) {
            for (const t of mediaStream.getTracks()) {
              try { t.stop(); } catch {}
            }
            mediaStream = null;
          }
          // Stop TTS playback
          if (ttsPlayer) {
            try { ttsPlayer.stop(); } catch {}
            ttsPlayer = null;
          }
          wsSession.queue = [];
          closeWS();
          wsSession.state = 'idle';
          wsSession.startTime = 0;
          // reset metrics (mirrors Swift HealthMetrics reset)
          wsSession.metrics = {
            framesSent: 0,
            lastSendTs: 0,
            avgIntervalMs: 0,
            intervalSamples: 0,
            queueDrops: 0,
            avgQueue: 0,
            queueSamples: 0,
            errorCount: 0,
            wsEvents: 0,
            avgPingMs: 0,
            pingSamples: [],
            queueEMA: 0,
            currentRMS: 0,
            avgRMS: 0,
            rmsSamples: []
          };
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      case 'get-health': {
        // Calculate uptime (mirrors Swift: Date().timeIntervalSince(startTime))
        const uptime = wsSession.startTime > 0 ? (Date.now() - wsSession.startTime) / 1000 : 0;

        const payload = {
          ok: true,
          state: wsSession.state,
          uptime: uptime,                                    // Swift: uptime
          errorCount: wsSession.metrics.errorCount,          // Swift: errorCount
          reconnectCount: wsSession.reconnectAttempts,       // Swift: reconnectCount
          avgPingMs: wsSession.metrics.avgPingMs,            // Swift: avgPingMs
          queueSize: wsSession.metrics.avgQueue,             // Swift: queueSize
          wsEvents: wsSession.metrics.wsEvents,              // Swift: wsEvents
          currentRMS: wsSession.metrics.currentRMS,          // Swift: inputLevelRMS (audio quality)
          avgRMS: wsSession.metrics.avgRMS,                  // Smoothed RMS
          inputLevelRMS: wsSession.metrics.avgRMS,           // Swift compatibility alias
          framesSent: wsSession.metrics.framesSent,
          avgIntervalMs: wsSession.metrics.avgIntervalMs,
          queueDrops: wsSession.metrics.queueDrops
        };
        // respond back to service worker explicitly
        try { chrome.runtime.sendMessage({ type: 'health-response', data: payload }); } catch {}
        sendResponse({ ok: true });
        break;
      }
      case 'ping':
        sendResponse({ ok: true, pong: true });
        break;
      case 'clear-history':
        transcriptHistory.clear();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: 'unknown-message' });
    }
  })();
  return true; // async
});

// Auto-prepare on load to keep the pipeline simple for MVP
(async () => {
  try {
    await handlePrepare();
    await transcriptHistory.load();  // Load history from storage
  } catch (e) { /* noop */ }
})();
