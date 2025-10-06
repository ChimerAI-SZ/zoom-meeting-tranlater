// Minimal Protobuf codec for BabelAI AST TranslateRequest/TranslateResponse
// Only encodes required fields used by MVP (StartSession, TaskRequest)
// and decodes TranslateResponse minimal fields (event, data, text, muted_duration_ms).

// Wire types
const WT_VARINT = 0;
const WT_64BIT = 1;
const WT_LEN = 2;
const WT_32BIT = 5;

// Events (from common/events.proto compiled values)
export const Events = {
  StartSession: 100,
  TaskRequest: 200,
  SessionStarted: 150,
  SessionCanceled: 151,
  SessionFinished: 152,
  SessionFailed: 153,
  AudioMuted: 250,
  TTSSentenceStart: 478,
  TTSSentenceEnd: 479,
  TTSResponse: 480,
  SourceSubtitleStart: 650,
  SourceSubtitleResponse: 651,
  SourceSubtitleEnd: 652,
  TranslationSubtitleStart: 653,
  TranslationSubtitleResponse: 654,
  TranslationSubtitleEnd: 655
};

function utf8Encode(str) {
  return new TextEncoder().encode(str);
}

function varintBytes(n) {
  const out = [];
  let v = n >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

function writeTag(buf, fieldNo, wt) {
  const key = (fieldNo << 3) | wt;
  const kb = varintBytes(key);
  buf.push(...kb);
}

function writeVarintField(buf, fieldNo, value) {
  writeTag(buf, fieldNo, WT_VARINT);
  buf.push(...varintBytes(value >>> 0));
}

function writeBoolField(buf, fieldNo, value) {
  writeVarintField(buf, fieldNo, value ? 1 : 0);
}

function writeBytesField(buf, fieldNo, u8) {
  writeTag(buf, fieldNo, WT_LEN);
  buf.push(...varintBytes(u8.length));
  buf.push(...u8);
}

function writeStringField(buf, fieldNo, str) {
  const u8 = utf8Encode(str);
  writeBytesField(buf, fieldNo, u8);
}

function writeMessageField(buf, fieldNo, innerBytes) {
  writeTag(buf, fieldNo, WT_LEN);
  buf.push(...varintBytes(innerBytes.length));
  buf.push(...innerBytes);
}

// Build common.RequestMeta { AppKey=2, ResourceID=4, ConnectionID=5, SessionID=6, Sequence=7 }
function buildRequestMeta({ sessionId, connectionId, appKey, resourceId, sequence }) {
  const b = [];
  if (appKey) writeStringField(b, 2, appKey);
  if (resourceId) writeStringField(b, 4, resourceId);
  if (connectionId) writeStringField(b, 5, connectionId);
  if (sessionId) writeStringField(b, 6, sessionId);
  if (sequence != null) writeVarintField(b, 7, sequence);
  return new Uint8Array(b);
}

// Build understanding.User { uid=1, did=2 }
function buildUser({ uid = 'simple_realtime', did = 'simple_realtime' }) {
  const b = [];
  writeStringField(b, 1, uid);
  writeStringField(b, 2, did);
  return new Uint8Array(b);
}

// Build understanding.Audio without binary (for config)
function buildAudioConfig({ format, rate, bits, channel }) {
  const b = [];
  if (format) writeStringField(b, 4, format);
  if (rate != null) writeVarintField(b, 7, rate);
  if (bits != null) writeVarintField(b, 8, bits);
  if (channel != null) writeVarintField(b, 9, channel);
  return new Uint8Array(b);
}

// Build understanding.Audio with binary_data (for chunk)
function buildAudioChunk(pcmBytes) {
  const b = [];
  writeBytesField(b, 14, new Uint8Array(pcmBytes));
  return new Uint8Array(b);
}

// Build ReqParams { mode=1, source_language=2, target_language=3 }
function buildReqParams({ mode = 's2s', source_language = 'zh', target_language = 'en' }) {
  const b = [];
  writeStringField(b, 1, mode);
  writeStringField(b, 2, source_language);
  writeStringField(b, 3, target_language);
  return new Uint8Array(b);
}

export function encodeStartSession({
  sessionId,
  connectionId,
  appKey,
  resourceId,
  sourceAudio = { format: 'wav', rate: 16000, bits: 16, channel: 1 },
  targetAudio = { format: 'pcm', rate: 48000, channel: 1 }, // 48kHz matching Swift
  mode = 's2s',
  source_language = 'zh',
  target_language = 'en',
  denoise = true
}) {
  const b = [];
  // 1: request_meta with sequence=0 for start session
  writeMessageField(b, 1, buildRequestMeta({ sessionId, connectionId, appKey, resourceId, sequence: 0 }));
  // 2: event = StartSession
  writeVarintField(b, 2, Events.StartSession);
  // 3: user
  writeMessageField(b, 3, buildUser({}));
  // 4: source_audio config
  writeMessageField(b, 4, buildAudioConfig(sourceAudio));
  // 5: target_audio config
  writeMessageField(b, 5, buildAudioConfig(targetAudio));
  // 6: request params
  writeMessageField(b, 6, buildReqParams({ mode, source_language, target_language }));
  // 7: denoise
  writeBoolField(b, 7, !!denoise);
  return new Uint8Array(b).buffer;
}

export function encodeAudioChunk({ sessionId, pcmBytes, sequence = 0 }) {
  const b = [];
  // 1: request_meta with SessionID and sequence
  writeMessageField(b, 1, buildRequestMeta({ sessionId, sequence }));
  // 2: event = TaskRequest
  writeVarintField(b, 2, Events.TaskRequest);
  // 4: source_audio.binary_data
  writeMessageField(b, 4, buildAudioChunk(pcmBytes));
  return new Uint8Array(b).buffer;
}

// Decoder for TranslateResponse minimal fields
export function decodeTranslateResponse(arrayBuffer) {
  const u8 = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  let pos = 0;
  const len = u8.length;
  const out = { event: 0 };

  function readVarint() {
    let shift = 0, result = 0;
    while (pos < len) {
      const b = u8[pos++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result >>> 0;
  }

  function readBytes() {
    const l = readVarint();
    const start = pos;
    pos += l;
    return u8.subarray(start, start + l);
  }

  while (pos < len) {
    const key = readVarint();
    const fieldNo = key >>> 3;
    const wt = key & 0x7;
    switch (fieldNo) {
      case 2: // event enum
        if (wt !== WT_VARINT) break;
        out.event = readVarint();
        break;
      case 3: // data bytes
        if (wt !== WT_LEN) break;
        out.data = readBytes();
        break;
      case 4: // text
        if (wt !== WT_LEN) break;
        out.text = new TextDecoder().decode(readBytes());
        break;
      case 8: // muted_duration_ms
        if (wt !== WT_VARINT) break;
        out.muted_duration_ms = readVarint();
        break;
      default:
        // skip unknown
        if (wt === WT_VARINT) {
          readVarint();
        } else if (wt === WT_64BIT) {
          pos += 8;
        } else if (wt === WT_LEN) {
          const l = readVarint();
          pos += l;
        } else if (wt === WT_32BIT) {
          pos += 4;
        } else {
          // invalid, abort
          pos = len;
        }
    }
  }
  return out;
}

