/**
 * BabelAI WebSocket Auth Proxy for Chrome Extension
 * Converts Sec-WebSocket-Protocol auth to proper Headers
 */

export default {
  async fetch(request, env) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    // Extract auth from subprotocol
    const protocol = request.headers.get('Sec-WebSocket-Protocol');
    if (!protocol || !protocol.startsWith('auth_')) {
      return new Response('Missing auth protocol', { status: 401 });
    }

    // Decode auth data
    const authBase64 = protocol.substring(5).split(',')[0];
    let auth;
    try {
      auth = JSON.parse(atob(authBase64));
    } catch (e) {
      return new Response('Invalid auth format', { status: 401 });
    }

    // Connect to BabelAI API with proper headers
    const apiUrl = 'wss://openspeech.bytedance.com/api/v4/ast/v2/translate';
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'Upgrade': 'websocket',
        'X-Api-App-Key': auth.appKey,
        'X-Api-Access-Key': auth.accessKey,
        'X-Api-Resource-Id': auth.resourceId || 'volc.service_type.10053',
        'X-Api-Connect-Id': auth.connectId
      }
    });

    // Return WebSocket proxy
    return apiResponse;
  }
};