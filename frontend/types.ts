export type Language = 'en' | 'te' | 'hi' | 'es' | 'ta';

export interface WeatherInfo {
  day: string;
  temp: number;
  condition: string;
  icon: string;
}

export interface Medicine {
  name: string;
  typical_dosage_or_application: string;
  notes: string;
}

export interface DiseaseDetectionResult {
  diseaseName: string;
  medicines: Medicine[];
  precautions: string[];
  causes: string[];
  summary: string;
  disclaimer:string;
  isHealthy: boolean;
  isCropDetected: boolean;
}


export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}