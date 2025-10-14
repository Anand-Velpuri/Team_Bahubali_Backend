import { DiseaseDetectionResult, Language, Medicine, ChatMessage } from '../types';
import { API_BASE_URL } from '../constants';

// This interface matches the backend schema for disease detection
interface BackendDiseaseResponse {
  disease_info: {
    predicted_disease: string;
    confidence_score: number;
  };
  treatment_details: {
    medicines: Medicine[];
    precautions: string[];
    causes: string[];
    summary: string;
    disclaimer: string;
  };
}

// Maps the backend's response to the frontend's DiseaseDetectionResult type
const mapBackendResponseToDiseaseResult = (data: BackendDiseaseResponse, t: Record<string, string>): DiseaseDetectionResult => {
  const { disease_info, treatment_details } = data;
  const diseaseName = disease_info.predicted_disease;

  // Infer boolean flags from the response string, since the backend doesn't provide them.
  const isHealthy = diseaseName.toLowerCase().includes('healthy');
  // Use the English translation for "no crop detected" as a stable key, as the backend might not localize this specific string.
  const isCropDetected = !diseaseName.toLowerCase().includes('no crop detected');

  return {
    diseaseName: diseaseName,
    medicines: treatment_details.medicines || [],
    precautions: treatment_details.precautions || [],
    causes: treatment_details.causes || [],
    summary: treatment_details.summary || '',
    disclaimer: treatment_details.disclaimer || '',
    isHealthy,
    isCropDetected,
  };
};

export const detectDisease = async (file: File, language: Language, t: Record<string, string>): Promise<DiseaseDetectionResult> => {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured in constants.ts");
  }

  const formData = new FormData();
  formData.append('file', file);

  const langName = { en: 'English', te: 'Telugu', hi: 'Hindi', es: 'Spanish', ta: 'Tamil' }[language];

  try {
    const response = await fetch(`${API_BASE_URL}/detect_disease?language=${langName}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      // Try to parse structured error body (some backends return JSON with `detail`)
      let parsed: any = null;
      try {
        parsed = await response.json();
      } catch (e) {
        // not JSON - fall back to text
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      if (response.status === 400 && parsed) {
        // prefer parsed.detail if present
        if (parsed.detail) {
          if (Array.isArray(parsed.detail)) {
            // join array entries into a readable string
            const msg = parsed.detail.map((d: any) => (typeof d === 'string' ? d : JSON.stringify(d))).join(' ');
            throw new Error(msg);
          }

          if (typeof parsed.detail === 'string') {
            throw new Error(parsed.detail);
          }

          // otherwise include the JSON detail
          throw new Error(JSON.stringify(parsed.detail));
        }
      }

      // fallback - include whatever parsed JSON says
      throw new Error(JSON.stringify(parsed));
    }

    const data: BackendDiseaseResponse = await response.json();
    return mapBackendResponseToDiseaseResult(data, t);
  } catch (error) {
    console.error("Error in detectDisease API call:", error);
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(t.errorApiConnection.replace('{url}', API_BASE_URL));
    }

    // If the backend already provided a meaningful Error (e.g., parsed detail), rethrow it so
    // the UI can display the server-provided message. Otherwise fall back to the generic string.
    if (error instanceof Error && error.message) {
      throw error;
    }

    throw new Error(t.errorApi);
  }
};

export const sendMessageToChat = async (message: string, history: ChatMessage[], t: Record<string, string>): Promise<string> => {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured in constants.ts");
  }

  try {
    // Backend expects a specific shape for history items. Our frontend uses { role, text }.
    // Convert to { role, message } and map our internal 'model' role to 'assistant' which is commonly expected.
    // Backend expects each history item to have a 'content' field. Provide content as an object
    // with a 'text' property so validation passes: { role, content: { text } }
    const mappedHistory = history.map(h => ({
      role: h.role === 'model' ? 'assistant' : h.role,
      // backend expects msg.content to be a string containing the message text
      content: h.text,
    }));

    const payload = { message, history: mappedHistory };

    // Debug: log outgoing payload in non-production for easier debugging of validation errors
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[chat] outgoing payload:', payload);
    }

    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Try to parse JSON error details (many backends return structured validation info)
      let parsedError: any = null;
      try {
        parsedError = await response.json();
      } catch (e) {
        // fall back to text
        parsedError = await response.text();
      }

      // Include structured validation details when available (helpful in dev)
      const detail = parsedError && parsedError.detail ? JSON.stringify(parsedError.detail) : parsedError;
      throw new Error(`HTTP error! status: ${response.status}, details: ${detail}`);
    }

    const data = await response.json();

    // Handle the ambiguous API response by taking the value of the first property.
    const responseValues = Object.values(data);
    if (responseValues.length > 0 && typeof responseValues[0] === 'string') {
      return responseValues[0];
    }

    throw new Error("Unexpected chat response format from backend.");

  } catch (error) {
    console.error("Error in chat API call:", error);
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(t.errorApiConnection.replace('{url}', API_BASE_URL));
    }
    throw new Error(t.chatError);
  }
};