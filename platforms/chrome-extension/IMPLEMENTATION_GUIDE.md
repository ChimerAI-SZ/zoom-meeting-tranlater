# BabelAI Chrome Extension 实施指南

## 快速开始

### 第一步：创建基础结构（30分钟）
```bash
cd platforms/chrome-extension
mkdir -p {popup,content,offscreen,proto,utils,icons}
npm init -y
npm install --save protobufjs
```

### 第二步：核心文件实现

#### 1. manifest.json
```json
{
  "manifest_version": 3,
  "name": "BabelAI",
  "version": "1.0.0",
  "minimum_chrome_version": "116",
  "permissions": ["tabCapture", "offscreen", "activeTab", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "service-worker.js" },
  "action": { "default_popup": "popup/popup.html" }
}
```

#### 2. service-worker.js（最小实现）
```javascript
let ws = null;
let capturing = false;

chrome.action.onClicked.addListener(async (tab) => {
  if (!capturing) {
    // 获取音频流ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });

    // 创建offscreen处理音频
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Audio capture'
    });

    // 启动WebSocket
    ws = new WebSocket('wss://api.babel-ai.net/v1/translate');
    ws.binaryType = 'arraybuffer';

    // 传递streamId
    chrome.runtime.sendMessage({
      type: 'START',
      streamId: streamId
    });

    capturing = true;
  }
});

// 接收音频数据
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AUDIO' && ws?.readyState === 1) {
    ws.send(msg.data);
  }
});

// 20秒心跳
setInterval(() => {
  if (ws?.readyState === 1) ws.send(new ArrayBuffer(0));
}, 20000);
```

#### 3. offscreen/offscreen.js（音频处理）
```javascript
let audioContext, source;

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === 'START') {
    // 获取音频流
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: msg.streamId
        }
      }
    });

    // 16kHz采样
    audioContext = new AudioContext({ sampleRate: 16000 });
    source = audioContext.createMediaStreamSource(stream);

    // 保持音频播放
    source.connect(audioContext.destination);

    // 处理器节点（80ms块）
    const processor = audioContext.createScriptProcessor(1280, 1, 1);
    source.connect(processor);

    processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);

      // Float32 → Int16
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
      }

      // 发送到service worker
      chrome.runtime.sendMessage({
        type: 'AUDIO',
        data: int16.buffer
      });
    };

    processor.connect(audioContext.destination);
  }
});
```

#### 4. popup/popup.html（控制界面）
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { width: 300px; padding: 10px; }
    button { width: 100%; padding: 10px; }
    .active { background: #4CAF50; color: white; }
  </style>
</head>
<body>
  <h3>BabelAI 实时翻译</h3>
  <button id="toggle">开始翻译</button>
  <select id="target-lang">
    <option value="en-US">英语</option>
    <option value="zh-CN">中文</option>
    <option value="ja-JP">日语</option>
  </select>
  <script src="popup.js"></script>
</body>
</html>
```

### 第三步：Protobuf集成

```bash
# 编译proto文件
npx pbjs -t static-module \
  -w es6 \
  -o proto/ast_service.js \
  ../../shared/protos/products/understanding/ast/ast_service.proto

# 生成TypeScript定义（可选）
npx pbts -o proto/ast_service.d.ts proto/ast_service.js
```

### 第四步：打包测试

1. Chrome浏览器打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `platforms/chrome-extension` 目录
5. 打开任意网页测试音频捕获

## 调试技巧

### Service Worker调试
```javascript
// 查看service worker日志
chrome://extensions/ → 查看视图 → Service Worker

// 强制刷新
chrome.runtime.reload();
```

### Offscreen调试
```javascript
// offscreen控制台
chrome://extensions/ → 查看视图 → offscreen.html

// 检查音频流状态
console.log('Audio state:', audioContext.state);
console.log('Sample rate:', audioContext.sampleRate);
```

### WebSocket监控
```javascript
// Chrome DevTools → Network → WS
// 查看二进制帧和消息
ws.addEventListener('message', (e) => {
  console.log('Received:', e.data.byteLength, 'bytes');
});
```

## 常见问题

### Q: 音频捕获无声音？
```javascript
// 确保连接到destination
source.connect(audioContext.destination);
```

### Q: Service Worker被杀死？
```javascript
// 20秒心跳保活
setInterval(() => ws.send('ping'), 20000);
```

### Q: Offscreen创建失败？
```javascript
// 检查是否已存在
try {
  await chrome.offscreen.createDocument({...});
} catch (e) {
  // 已存在，直接使用
}
```

## 性能优化

### 1. 内存优化
```javascript
// 使用SharedArrayBuffer（需要COOP/COEP headers）
const buffer = new SharedArrayBuffer(16384);
```

### 2. CPU优化
```javascript
// 使用AudioWorklet替代ScriptProcessor
await audioContext.audioWorklet.addModule('processor.js');
const node = new AudioWorkletNode(audioContext, 'pcm-processor');
```

### 3. 网络优化
```javascript
// 批量发送
const batch = [];
const BATCH_SIZE = 10;

if (batch.length >= BATCH_SIZE) {
  ws.send(concatenateBuffers(batch));
  batch.length = 0;
}
```

## 发布清单

- [ ] 图标文件（16/48/128px）
- [ ] 截图（1280x800, 最多5张）
- [ ] 描述文案（132字符内）
- [ ] 隐私政策URL
- [ ] 支持邮箱
- [ ] 分类选择（生产力工具）
- [ ] 定价（免费/付费）

## 命令速查

```bash
# 开发
npm run dev        # 监听文件变化
npm run build      # 生产构建
npm run test       # 运行测试

# 打包
npm run package    # 生成.zip文件

# 发布
npm run publish    # 上传到Chrome Web Store
```

## 核心依赖

```json
{
  "dependencies": {
    "protobufjs": "^7.2.5"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.251",
    "typescript": "^5.3.0",
    "webpack": "^5.89.0"
  }
}
```

---

**估算时间**：基础版本2周，完整版本4-5周