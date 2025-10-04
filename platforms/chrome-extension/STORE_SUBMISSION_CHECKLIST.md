# Chrome Web Store Submission Checklist

## ✅ Completed Items

### Code Implementation
- [x] TTS audio playback (48kHz, 2ms fade-out)
- [x] Subtitle optimization (styles, history, bilingual display)
- [x] Health monitoring (uptime, ping, RMS, queue, errors, reconnects)
- [x] Input validation for configuration
- [x] Error handling and user feedback
- [x] Production-ready logging (DEBUG flags)
- [x] Manifest V3 compliance
- [x] Enhanced manifest.json metadata

### Documentation
- [x] Privacy Policy (PRIVACY_POLICY.md)
- [x] Icon requirements (icons/README.md)
- [x] README.md with installation instructions
- [x] Worker deployment guide (wrangler)

### Icons
- [x] icon16.png (16x16 px) - Copied from Swift project
- [x] icon32.png (32x32 px) - Copied from Swift project
- [x] icon48.png (48x48 px) - Generated from 64x64
- [x] icon128.png (128x128 px) - Copied from Swift project

### Privacy Policy
- [x] Privacy policy hosted at https://babelai.app/privacy.html
- [x] Chrome Extension section added to privacy policy
- [x] manifest.json updated with privacy_policy URL

---

## 🔲 Pending Items (Required Before Submission)

### 1. Icons (P0 - Blocking)

**Status**: ✅ COMPLETED

**Completed Actions**:
- ✅ Copied icon16.png from Swift project (488B)
- ✅ Copied icon32.png from Swift project (1.0K)
- ✅ Generated icon48.png from 64x64 using sips (2.0K)
- ✅ Copied icon128.png from Swift project (9.4K)

**Result**: All 4 required icon sizes are now in `icons/` directory with brand consistency between macOS and Chrome versions.

**Completed Time**: 3 minutes

---

### 2. Screenshots (P0 - ONLY REMAINING BLOCKER)

**Status**: ❌ Not provided

**Requirements**:
- At least 1 screenshot (1280x800 or 640x400 recommended)
- Maximum 5 screenshots
- Show key features: translation UI, subtitle overlay, health monitoring

**Suggested Screenshots**:
1. Extension popup with configuration panel
2. Live subtitle overlay on a video
3. Health monitoring panel showing metrics
4. Subtitle history view
5. Successful translation in action

**Action**:
1. Open extension and navigate to features
2. Take high-quality screenshots
3. Optionally add annotations/highlights
4. Save as PNG or JPEG

**Estimated Time**: 1 hour

---

### 3. Promotional Assets (Optional but Recommended)

**Promotional Tile** (440x280 px)
- Small promotional image shown in search results
- Shows app name and key value proposition

**Marquee Tile** (1400x560 px, optional)
- Featured placement asset
- Only if you want featured consideration

---

### 4. Store Listing Text

**Status**: ✅ Partial (short description in manifest)

**Required Fields**:

1. **Detailed Description** (max 132 characters for summary)
   ```
   Current: "Real-time speech-to-speech translation with live subtitles..."
   ```
   ✅ Good, but can enhance with:
   - Key features bullet points
   - Use cases (YouTube, meetings, podcasts)
   - Supported languages
   - Technical highlights (48kHz TTS, echo cancellation)

2. **Category**
   - Suggested: "Productivity" or "Accessibility"

3. **Language**
   - English (default)
   - Consider adding Chinese (中文) listing

---

### 5. Privacy Policy (P0 - Blocking)

**Status**: ✅ COMPLETED

**Completed Actions**:
- ✅ Added comprehensive Chrome Extension section to website/privacy.html
- ✅ Documented all 7 Chrome permissions with justifications
- ✅ Explained Chrome-specific data collection and security
- ✅ Added Chrome Web Store compliance section
- ✅ Updated manifest.json with `"privacy_policy": "https://babelai.app/privacy.html"`
- ✅ Pushed to GitHub and deployed to Vercel (auto-deployment)
- ✅ Simplified PRIVACY_POLICY.md to reference hosted version

**Result**: Privacy policy now publicly hosted and linked in manifest.json, fully compliant with Chrome Web Store requirements.

**Completed Time**: 22 minutes

---

### 6. Cloudflare Worker Deployment

**Status**: ⚠️ Instructions provided, needs deployment

**Action**:
1. Deploy Worker: `cd platforms/chrome-extension && npx wrangler deploy`
2. Note the Worker URL (e.g., `wss://babelai-ws.YOUR.workers.dev`)
3. Update README.md with actual Worker URL
4. Test connection from extension

**Estimated Time**: 15 minutes

---

## 📋 Submission Steps

Once all above items are completed:

1. **Zip Extension**
   ```bash
   cd platforms/chrome-extension
   zip -r babelai-chrome-v1.0.0.zip . -x "*.git*" "node_modules/*" "*.md" "STORE_*"
   ```

2. **Create Chrome Web Store Developer Account**
   - Visit: https://chrome.google.com/webstore/devconsole
   - Pay one-time $5 registration fee

3. **Upload Extension**
   - Click "New Item"
   - Upload ZIP file
   - Fill in store listing details
   - Upload screenshots
   - Add privacy policy URL

4. **Select Distribution**
   - Public (recommended for open-source)
   - Unlisted (only people with link)
   - Private (for organization only)

5. **Submit for Review**
   - Review process typically takes 1-3 business days
   - May require revisions if issues found

---

## 🎯 Estimated Total Time to Submission

| Task | Time | Status |
|------|------|--------|
| Icons design | 3m | ✅ COMPLETED |
| Privacy policy finalization | 22m | ✅ COMPLETED |
| Screenshots | 1h | ❌ ONLY REMAINING BLOCKER |
| Worker deployment | 15m | ⚠️ Ready to deploy |
| Store listing text | 30m | ✅ Partial |
| Upload and submit | 30m | ⏸️ Waiting |
| **TOTAL** | **2.5h** | **~60% complete** |

---

## 🚨 Common Rejection Reasons to Avoid

1. ❌ Missing or incomplete privacy policy
2. ❌ Poor quality or missing screenshots
3. ❌ Icons don't meet size requirements
4. ❌ Excessive permissions without justification
5. ❌ Functionality not clearly explained
6. ❌ API credentials hardcoded in source

**Our Status**: ✅ All code quality checks passed!

---

## 📞 Support Resources

- **Chrome Web Store Policies**: https://developer.chrome.com/docs/webstore/program-policies/
- **Publishing Guide**: https://developer.chrome.com/docs/webstore/publish/
- **Branding Guidelines**: https://developer.chrome.com/docs/webstore/branding/
- **Review Process**: https://developer.chrome.com/docs/webstore/review-process/

---

## ✅ Next Steps (Priority Order)

1. ~~**P0**: Design and create icons~~ ✅ **COMPLETED**
2. ~~**P0**: Finalize and host privacy policy~~ ✅ **COMPLETED**
3. **P0**: Take screenshots (ONLY REMAINING BLOCKER - 1 hour)
4. **P1**: Deploy Cloudflare Worker (needed for functionality - 15 min)
5. **P1**: Enhance store listing description (optional - 30 min)
6. **P2**: Submit to Chrome Web Store (30 min)
7. **P2**: Monitor review feedback and iterate

**Ready to Submit**: After completing screenshots (estimated 1-2 hours total)
