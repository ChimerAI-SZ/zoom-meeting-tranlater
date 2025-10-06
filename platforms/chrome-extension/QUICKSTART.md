# BabelAI Chrome Extension - Quick Start Guide

## 🚀 加载扩展（2分钟）

1. **打开Chrome扩展管理页面**
   ```
   chrome://extensions/
   ```

2. **开启开发者模式**
   - 右上角打开"开发者模式"开关

3. **加载扩展**
   - 点击"加载已解压的扩展程序"
   - 选择文件夹：`platforms/chrome-extension/`

4. **确认加载成功**
   - ✅ 扩展列表显示"BabelAI - Real-time Speech Translation"
   - ✅ 无错误提示
   - ✅ 工具栏显示BabelAI图标

## 🔧 配置API凭证（仅开发者）

### 方法1：使用开发者脚本（推荐）

1. 点击扩展卡片的"Service Worker"链接
2. 在打开的DevTools Console中运行：
   ```javascript
   // 配置你的API凭证
   const API_CONFIG = {
     API_APP_KEY: '你的APP_KEY',
     API_ACCESS_KEY: '你的ACCESS_KEY',
     API_RESOURCE_ID: 'volc.service_type.10053',
     WORKER_URL: 'wss://babelai-ws.你的域名.workers.dev'
   };

   // 保存配置
   chrome.storage.local.set({ api_config: API_CONFIG }, () => {
     console.log('✅ API配置已保存！');
   });
   ```

### 方法2：手动设置（备选）

编辑 `config/api_secrets.json`：
```json
{
  "API_APP_KEY": "你的实际APP_KEY",
  "API_ACCESS_KEY": "你的实际ACCESS_KEY",
  "API_RESOURCE_ID": "volc.service_type.10053",
  "WORKER_URL": "wss://babelai-ws.你的域名.workers.dev"
}
```

## 🎯 使用扩展

1. **打开任意视频网站**（YouTube、Bilibili等）
2. **点击BabelAI扩展图标**
3. **点击"开始翻译"大按钮**
4. **享受实时翻译！**

## ✨ 新功能特点

### 🎨 现代化UI
- 一键启动设计
- 折叠式设置面板
- 实时健康监控
- 优雅的动画效果

### 🌍 国际化支持
- 点击右上角"中文/EN"切换语言
- 自动检测浏览器语言
- 完整的中英文界面

### 🔒 安全性提升
- API凭证不再暴露给用户
- 配置存储在Chrome安全存储中
- 支持Demo模式运行

## ⚠️ 常见问题

### 问题：扩展无法加载
- 确保Chrome版本 >= 116
- 检查文件夹路径是否正确
- 查看是否有错误提示

### 问题：显示"Demo mode"
- 需要配置API凭证（见上方配置步骤）
- 或联系管理员获取正式版本

### 问题：界面显示英文
- 点击右上角"中文"按钮切换语言
- 或在设置中更改界面语言

## 📝 开发者注意事项

1. **不要提交api_secrets.json到Git**
   - 已添加到.gitignore
   - 仅保留.example模板文件

2. **生产版本构建**
   - 需要内置加密的API凭证
   - 移除所有调试代码
   - 压缩打包发布

3. **调试技巧**
   - Service Worker Console查看后台日志
   - 页面Console查看字幕注入日志
   - Chrome DevTools查看网络请求

## 🔗 相关链接

- [Chrome Extension开发文档](https://developer.chrome.com/docs/extensions/)
- [BabelAI API文档](https://openspeech.bytedance.com/docs)
- [问题反馈](https://github.com/YOUR-ORG/s2s/issues)