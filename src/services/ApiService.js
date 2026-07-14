const API_CONFIG = {
  // BASE_URL: 'http://YOUR_LOCAL_IP:5000',   

  BASE_URL: 'http://192.168.68.105:5000',    // <-- Replace with your IP like shown above
  TIMEOUT: 90000,
};

const ENDPOINTS = {
  CHATBOT: '/api/chatbot',
  TRIAGE: '/api/triage',
  TRIAGE_CHAT: '/api/triage_chat',
  CLEAR_SESSION: '/api/clear_session',
  HEALTH_CHECK: '/health',
};

const ErrorTypes = {
  NETWORK: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  SERVER: 'SERVER_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
};

// Helper function to create fetch with timeout
const fetchWithTimeout = (url, options = {}, timeout = API_CONFIG.TIMEOUT) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    ),
  ]);
};

// Helper function to build full URL
const buildUrl = (endpoint) => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

// Helper function to parse errors
const parseError = (error, response = null) => {
  if (error.message === 'Request timeout' || error.message.includes('timeout')) {
    return {
      type: ErrorTypes.TIMEOUT,
      message: 'The request took too long. Please try again.',
      technicalError: error.message,
    };
  }

  if (error.message === 'Failed to fetch' || error.message.includes('Network') || !response) {
    return {
      type: ErrorTypes.NETWORK,
      message: 'Unable to connect to the AI service. Please check your internet connection.',
      technicalError: error.message,
    };
  }

  if (response) {
    const { status } = response;

    switch (status) {
      case 400:
        return {
          type: ErrorTypes.VALIDATION,
          message: 'Invalid request. Please check your input and try again.',
          technicalError: 'Bad Request',
          statusCode: status,
        };
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          type: ErrorTypes.SERVER,
          message: 'The AI service is temporarily unavailable. Please try again in a moment.',
          technicalError: 'Server Error',
          statusCode: status,
        };
      default:
        return {
          type: ErrorTypes.SERVER,
          message: 'An unexpected error occurred. Please try again.',
          technicalError: `HTTP ${status}`,
          statusCode: status,
        };
    }
  }

  return {
    type: ErrorTypes.UNKNOWN,
    message: 'An unexpected error occurred. Please try again.',
    technicalError: error.message || 'Unknown error',
  };
};

// Helper function to create FormData for chat messages
const createChatFormData = (messageData, conversationId) => {
  const formData = new FormData();

  console.log('Creating FormData with:', {
    hasText: !!messageData.text,
    hasImages: !!messageData.images,
    imageCount: messageData.images?.length || 0,
    hasAudio: !!messageData.audioUri,
    hasDocument: !!messageData.documentUri,
    conversationId
  });

  if (conversationId) {
    formData.append('conversation_id', conversationId);
  }

  if (messageData.text && messageData.text.trim()) {
    formData.append('message', messageData.text.trim());
  }

  // Handle multiple images (send only the first one)
  if (messageData.images && messageData.images.length > 0) {
    const firstImage = messageData.images[0];
    
    // Extract filename from URI
    const uriParts = firstImage.uri.split('/');
    const filename = uriParts[uriParts.length - 1];
    
    const imageFile = {
      uri: firstImage.uri,
      type: firstImage.type || firstImage.mimeType || 'image/jpeg',
      name: firstImage.fileName || filename || `image_${Date.now()}.jpg`,
    };
    
    console.log('Appending image:', imageFile.name, 'Type:', imageFile.type);
    formData.append('image', imageFile);
  }

  // Handle document (PDF, etc.)
  if (messageData.documentUri) {
    const uriParts = messageData.documentUri.split('/');
    const filename = uriParts[uriParts.length - 1];
    
    const documentFile = {
      uri: messageData.documentUri,
      type: messageData.documentMimeType || 'application/pdf',
      name: messageData.documentName || filename || `document_${Date.now()}.pdf`,
    };
    
    console.log('Appending document:', documentFile.name, 'Type:', documentFile.type);
    formData.append('document', documentFile);
  }

  // Handle audio
  if (messageData.audioUri) {
    // Extract filename from URI
    const uriParts = messageData.audioUri.split('/');
    const filename = uriParts[uriParts.length - 1];
    
    const audioFile = {
      uri: messageData.audioUri,
      type: 'audio/webm',
      name: filename || `audio_${Date.now()}.webm`,
    };
    
    console.log('Appending audio:', audioFile.name);
    formData.append('audio', audioFile);
  }

  return formData;
};

const ApiService = {
  // Get current base URL
  getBaseUrl: () => API_CONFIG.BASE_URL,
  
  // Update base URL dynamically
  setBaseUrl: (newUrl) => {
    API_CONFIG.BASE_URL = newUrl;
  },

  // Health check
  healthCheck: async () => {
    try {
      const response = await fetchWithTimeout(
        buildUrl(ENDPOINTS.HEALTH_CHECK),
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        },
        5000
      );
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      throw error;
    }
  },

  // Send chat message
  sendChatMessage: async (messageData, conversationId = null) => {
    try {
      console.log('=== ApiService.sendChatMessage called ===');
      console.log('Message Data:', {
        type: messageData.type,
        hasText: !!messageData.text,
        textLength: messageData.text?.length || 0,
        hasImages: !!messageData.images,
        imageCount: messageData.images?.length || 0,
        hasAudio: !!messageData.audioUri,
        hasDocument: !!messageData.documentUri,
      });
      console.log('Conversation ID:', conversationId);

      // Validate message data
      if (!messageData.text && !messageData.images && !messageData.audioUri && !messageData.documentUri) {
        throw new Error('Message must contain text, image, audio, or document');
      }

      // Create form data
      const formData = createChatFormData(messageData, conversationId);

      console.log('Sending request to:', buildUrl(ENDPOINTS.CHATBOT));

      const response = await fetchWithTimeout(
        buildUrl(ENDPOINTS.CHATBOT),
        {
          method: 'POST',
          body: formData,
          // DO NOT set Content-Type header - let browser set it with boundary
          headers: {
            // 'Content-Type': 'multipart/form-data', // REMOVED - This is the problem!
          },
        }
      );

      console.log('Response status:', response.status);

      const data = await response.json();
      console.log('Response data:', data);

      // Handle error responses
      if (!response.ok) {
        const parsedError = parseError(new Error(data.error || 'Request failed'), response);
        return {
          success: false,
          error: parsedError.type,
          message: data.response || parsedError.message,
          technicalError: data.error || parsedError.technicalError,
          statusCode: response.status,
          data: null,
        };
      }

      // Handle backend error status
      if (data.status === 'error') {
        return {
          success: false,
          error: data.error || 'unknown_error',
          message: data.response || 'An error occurred while processing your request.',
          data: data,
        };
      }

      // Success response
      console.log('✓ Message sent successfully');
      return {
        success: true,
        data: {
          response: data.response,
          conversation_id: data.conversation_id,
          conversation_title: data.conversation_title,
          processing_time: data.processing_time,
        },
        message: null,
        error: null,
      };

    } catch (error) {
      console.error('!!! ApiService Error !!!');
      console.error('Error type:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

      const parsedError = parseError(error);

      return {
        success: false,
        error: parsedError.type,
        message: parsedError.message,
        technicalError: parsedError.technicalError,
        statusCode: parsedError.statusCode,
        data: null,
      };
    }
  },

  // Doctor-style triage interview — one structured turn per call.
  // POPIA: patient_context must never include names, ID numbers, phones, or emails.
  // Prefer age-only clinical context from the client (buildPatientContext).
  sendTriageChatMessage: async (message, conversationId = null, patientContext = '') => {
    try {
      // Defence in depth — strip common identity patterns before the request leaves the device
      const safeContext = String(patientContext || '')
        .replace(/\b(patient|name|id|passport|email|phone|address)\s*:\s*[^\n.]+/gi, '')
        .trim();

      const response = await fetchWithTimeout(
        buildUrl(ENDPOINTS.TRIAGE_CHAT),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            message,
            conversation_id: conversationId,
            patient_context: safeContext,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.status === 'error') {
        return {
          success: false,
          message: data.response || 'The consultation service is unavailable. Please try again.',
          data: null,
        };
      }

      return {
        success: true,
        data: {
          phase: data.phase || 'interviewing',
          confidence: data.confidence ?? 0,
          response: data.response || '',
          triage: data.triage || null,
          conversation_id: data.conversation_id,
          processing_time: data.processing_time,
        },
      };
    } catch (error) {
      const parsedError = parseError(error);
      return { success: false, message: parsedError.message, data: null };
    }
  },

  // Submit symptoms for structured AI triage — calls /api/triage, returns { priority, riskScore, ... }
  submitTriage: async (symptoms, context = '') => {
    try {
      const response = await fetchWithTimeout(
        buildUrl(ENDPOINTS.TRIAGE),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ symptoms, context }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.status === 'error') {
        return {
          success: false,
          message: data.response || 'Triage request failed.',
          data: null,
        };
      }

      return { success: true, data: data.data };
    } catch (error) {
      const parsedError = parseError(error);
      return { success: false, message: parsedError.message, data: null };
    }
  },

  // Clear chat session
  clearChatSession: async (conversationId) => {
    try {
      if (!conversationId) {
        throw new Error('Conversation ID is required');
      }

      const response = await fetchWithTimeout(
        buildUrl(ENDPOINTS.CLEAR_SESSION),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversation_id: conversationId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to clear session');
      }

      return {
        success: data.status === 'success',
        message: data.message,
      };

    } catch (error) {
      const parsedError = parseError(error);
      return {
        success: false,
        error: parsedError.type,
        message: parsedError.message,
      };
    }
  },
};

export default ApiService;
export { API_CONFIG, ENDPOINTS, ErrorTypes };