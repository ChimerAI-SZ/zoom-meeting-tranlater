# BabelAI Chrome Extension v1.0 设计规范

## 一、架构设计

### 1.1 核心架构
```
platforms/chrome-extension/
├── manifest.json          # Manifest V3配置
├── service-worker.js      # 后台服务（WebSocket管理）
├── offscreen/            # 音频处理（Chrome 116+）
│   ├── offscreen.html
│   └── offscreen.js      # tabCapture音频处理
├── popup/                # 控制面板
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── content/              # 内容脚本
│   ├── subtitle.js       # 字幕注入
│   └── subtitle.css
├── proto/                # Protobuf定义（编译后）
│   └── ast_service.js
└── utils/
    ├── websocket.js      # WebSocket管理
    └── audio.js          # 音频处理工具
```

### 1.2 数据流设计
```
Tab音频 → tabCapture → Offscreen Document → PCM处理
    ↓
WebSocket → BabelAI后端（复用现有协议）
    ↓
翻译结果 → Content Script → 页面字幕注入
```

## 二、技术规范

### 2.1 Manifest配置
```json
{
  "manifest_version": 3,
  "name": "BabelAI 实时翻译",
  "version": "1.0.0",
  "minimum_chrome_version": "116",
  "description": "实时音频翻译，支持会议和视频",

  "permissions": [
    "tabCapture",
    "offscreen",
    "activeTab",
    "storage"
  ],

  "host_permissions": ["<all_urls>"],

  "background": {
    "service_worker": "service-worker.js"
  },

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },

  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/subtitle.js"],
    "css": ["content/subtitle.css"],
    "run_at": "document_idle"
  }]
}
```

### 2.2 Service Worker实现
```javascript
// service-worker.js
class BabelAIService {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.streamId = null;
    this.isCapturing = false;
  }

  async startCapture(tabId) {
    // 获取stream ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    // 创建offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capturing tab audio for real-time translation'
    });

    // 建立WebSocket连接
    this.connectWebSocket();

    // 传递streamId到offscreen
    chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      streamId: streamId,
      sessionId: this.sessionId
    });
  }

  connectWebSocket() {
    const config = await chrome.storage.local.get(['apiKey', 'wsUrl']);
    this.ws = new WebSocket(config.wsUrl || 'wss://api.babel-ai.net/v1/translate');

    // 设置headers（通过subprotocol传递）
    this.ws.onopen = () => {
      // 发送初始化请求
      const initRequest = this.buildInitRequest();
      this.ws.send(initRequest);

      // 启动心跳
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      this.handleTranslationResponse(event.data);
    };
  }

  startHeartbeat() {
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(new ArrayBuffer(0)); // ping
      }
    }, 20000); // 20秒心跳
  }
}
```

### 2.3 Offscreen音频处理
```javascript
// offscreen/offscreen.js
class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.source = null;
    this.processor = null;
  }

  async startCapture(streamId) {
    // 获取音频流
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    // 创建音频上下文（16kHz采样率）
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(stream);

    // 保持音频播放（避免静音）
    const destination = this.audioContext.createMediaStreamDestination();
    this.source.connect(destination);
    this.source.connect(this.audioContext.destination);

    // 创建处理器
    await this.audioContext.audioWorklet.addModule('audio-worklet.js');
    this.processor = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    // 连接处理链
    this.source.connect(this.processor);

    // 发送PCM数据到service worker
    this.processor.port.onmessage = (event) => {
      chrome.runtime.sendMessage({
        type: 'AUDIO_DATA',
        data: event.data.pcm // Int16Array
      });
    };
  }
}
```

### 2.4 内容脚本字幕注入
```javascript
// content/subtitle.js
class SubtitleRenderer {
  constructor() {
    this.container = null;
    this.sourceText = '';
    this.translationText = '';
    this.init();
  }

  init() {
    // 创建字幕容器
    this.container = document.createElement('div');
    this.container.id = 'babelai-subtitle';
    this.container.className = 'babelai-subtitle-container';
    document.body.appendChild(this.container);

    // 监听消息
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_UPDATE') {
        this.updateSubtitle(message);
      }
    });
  }

  updateSubtitle(message) {
    const { event, text } = message;

    switch(event) {
      case 'SOURCE_SUBTITLE':
        this.sourceText = text;
        break;
      case 'TRANSLATION_SUBTITLE':
        this.translationText = text;
        break;
    }

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="babelai-source">${this.sourceText}</div>
      <div class="babelai-translation">${this.translationText}</div>
    `;
  }
}
```

## 三、协议集成

### 3.1 复用现有Protobuf
```javascript
// 使用protobufjs编译后的JavaScript版本
import { TranslateRequest, TranslateResponse } from './proto/ast_service.js';

function buildAudioRequest(pcmData) {
  const request = new TranslateRequest({
    event: 'TASK_REQUEST',
    sourceAudio: {
      data: pcmData,
      format: 'pcm',
      rate: 16000,
      bits: 16,
      channel: 1
    },
    targetAudio: {
      format: 'pcm',
      rate: 48000,
      bits: 16,
      channel: 1
    },
    request: {
      mode: 's2s',
      sourceLanguage: 'zh-CN',
      targetLanguage: 'en-US'
    }
  });

  return request.serializeBinary();
}
```

### 3.2 WebSocket协议头
```javascript
// 复用现有认证头
const headers = {
  'X-Api-App-Key': config.appKey,
  'X-Api-Access-Key': config.accessKey,
  'X-Api-Resource-Id': config.resourceId,
  'X-Api-Connect-Id': generateUUID()
};
```

## 四、开发步骤

### Phase 1: 基础框架（第1周）
1. 创建项目结构
2. 配置manifest.json
3. 实现基础service worker
4. 创建popup界面

### Phase 2: 音频捕获（第2周）
1. 实现tabCapture获取streamId
2. 创建offscreen document
3. 音频流处理（PCM转换）
4. 测试音频捕获质量

### Phase 3: 后端集成（第3周）
1. 移植Protobuf定义到JS
2. 实现WebSocket连接
3. 音频数据打包发送
4. 心跳和重连机制

### Phase 4: 字幕渲染（第4周）
1. Content script注入
2. 字幕样式设计
3. 位置自适应（避免遮挡）
4. 字幕更新动画

### Phase 5: 优化发布（第5周）
1. 性能优化（内存、CPU）
2. 错误处理完善
3. 用户设置持久化
4. Chrome Web Store发布

## 五、关键技术点

### 5.1 音频不中断
```javascript
// 保持原音频播放
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(stream);
source.connect(audioContext.destination); // 关键：连接到输出
```

### 5.2 Service Worker保活
```javascript
// 20秒心跳防止休眠
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send('ping');
  }
}, 20000);
```

### 5.3 Offscreen生命周期
```javascript
// 监听offscreen关闭，自动重建
chrome.offscreen.onClosed.addListener(() => {
  if (this.isCapturing) {
    this.recreateOffscreen();
  }
});
```

### 5.4 字幕防遮挡
```javascript
// 智能定位算法
function findSafePosition() {
  const videoElements = document.querySelectorAll('video');
  if (videoElements.length > 0) {
    // 定位到视频下方
    const video = videoElements[0];
    const rect = video.getBoundingClientRect();
    return { top: rect.bottom - 100, left: rect.left };
  }
  // 默认底部中央
  return { bottom: 50, left: '50%' };
}
```

## 六、性能指标

- 音频延迟：< 100ms
- CPU占用：< 5%
- 内存占用：< 50MB
- WebSocket重连：< 2秒
- 字幕刷新率：实时流式

## 七、兼容性

- Chrome 116+（必需）
- 支持所有网站音频捕获
- 特殊优化：YouTube、Netflix、Zoom Web
- 降级方案：无offscreen支持时提示升级

## 八、安全考虑

1. API密钥存储在chrome.storage.local
2. WebSocket使用wss://加密传输
3. 仅在用户主动点击时开始捕获
4. 遵循Chrome扩展CSP策略

## 九、发布准备

1. 图标设计（16/48/128px）
2. Chrome Web Store截图（1280x800）
3. 隐私政策声明
4. 开源协议选择（建议MIT）

## 十、后续版本规划

- v1.1：添加快捷键支持
- v1.2：字幕样式自定义
- v1.3：离线字幕导出
- v2.0：本地模型支持（WebAssembly）