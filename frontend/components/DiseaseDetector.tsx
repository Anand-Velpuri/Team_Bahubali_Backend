import React, { useState, useRef, useCallback, useEffect } from 'react';
import Card from './shared/Card';
import LeafIcon from './icons/LeafIcon';
import UploadIcon from './icons/UploadIcon';
import Chat from './Chat';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import { detectDisease } from '../services/geminiService';
import { DiseaseDetectionResult, Language } from '../types';
import FileTextIcon from './icons/FileTextIcon';
import ActivityIcon from './icons/ActivityIcon';
import PillIcon from './icons/PillIcon';
import ShieldIcon from './icons/ShieldIcon';
import CameraIcon from './icons/CameraIcon';

interface DiseaseDetectorProps {
  t: Record<string, string>;
  language: Language;
}

const DiseaseDetector: React.FC<DiseaseDetectorProps> = ({ t, language }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DiseaseDetectionResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [retranslating, setRetranslating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraAvailable, setCameraAvailable] = useState<boolean>(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    const checkForCamera = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter(device => device.kind === 'videoinput');
          setVideoDevices(videoInputs);
          setCameraAvailable(videoInputs.length > 0);
        } catch (err) {
          console.error('Error checking for camera:', err);
          setVideoDevices([]);
          setCameraAvailable(false);
        }
      } else {
        setVideoDevices([]);
        setCameraAvailable(false);
      }
    };
    checkForCamera();
  }, []);

  const handleDetectAnother = () => {
    setSelectedImage(null);
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFile(currentFile);
      setSelectedImage(URL.createObjectURL(currentFile));
      setResult(null);
      setError(null);
    }
  };

  const handleDetectDisease = useCallback(async (currentFile: File, currentLanguage: Language) => {
    if (!currentFile) return;
    setError(null);
    setResult(null);
    try {
      const detectionResult = await detectDisease(currentFile, currentLanguage, t);
      setResult(detectionResult);
    } catch (err) {
      // Try to extract structured server-side validation messages if present
      let errorMessage = t.errorApi;
      if (err instanceof Error) {
        const raw = err.message || '';
        // Attempt to find JSON substring in the error message
        const jsonStart = raw.indexOf('{');
        if (jsonStart !== -1) {
          try {
            const parsed = JSON.parse(raw.slice(jsonStart));
            if (parsed) {
              // backend may send { detail: '...' } or { detail: [...] }
              if (parsed.detail) {
                if (Array.isArray(parsed.detail)) {
                  // join array items into a friendly string
                  errorMessage = parsed.detail.map((d: any) => (typeof d === 'string' ? d : JSON.stringify(d))).join(' ');
                } else if (typeof parsed.detail === 'string') {
                  errorMessage = parsed.detail;
                } else {
                  errorMessage = JSON.stringify(parsed.detail);
                }
              } else if (parsed.message) {
                errorMessage = parsed.message;
              } else {
                errorMessage = raw;
              }
            }
          } catch (parseErr) {
            // Not JSON or parse failed — fall back to raw message
            errorMessage = raw;
          }
        } else {
          // No JSON present — show raw error message
          errorMessage = raw;
        }
      }

      // Map well-known backend validation messages to localized translations when possible
      const backendLeafMsg = 'No valid plant leaf detected. Please upload a clear image of a plant leaf.';
      if (errorMessage && errorMessage.includes(backendLeafMsg)) {
        setError(t.noValidLeafDetected || backendLeafMsg);
      } else {
        setError(errorMessage);
      }
      console.error('Detect error:', err);
    }
  }, [t]);

  const onDetectClick = () => {
    if (file) {
      setLoading(true);
      handleDetectDisease(file, language).finally(() => setLoading(false));
    }
  }

  const closeCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    setIsCameraOpen(false);
  }, [stream]);

  const handleCapture = useCallback(() => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const capturedFile = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setFile(capturedFile);
            setSelectedImage(URL.createObjectURL(capturedFile));
            setResult(null);
            setError(null);
            closeCamera();
          }
        }, 'image/jpeg');
      }
    }
  }, [closeCamera]);

  const openCamera = async (options?: { deviceId?: string; facing?: 'environment' | 'user' }) => {
    // Try to open the back (environment) camera when available. Fallback to default camera.
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('No mediaDevices support');
      }

      // If a specific deviceId is provided, try that first
      const tryConstraints: MediaStreamConstraints[] = [];
      if (options?.deviceId) {
        tryConstraints.push({ video: { deviceId: { exact: options.deviceId } } });
      }

      // Next try using facingMode preference
      const facingToTry = options?.facing || cameraFacing || 'environment';
      tryConstraints.push({ video: { facingMode: { exact: facingToTry } } });
      tryConstraints.push({ video: { facingMode: { ideal: facingToTry } } });

      // Finally, fallback to any camera
      tryConstraints.push({ video: true });

      let mediaStream: MediaStream | null = null;
      for (const constraints of tryConstraints) {
        try {
          // eslint-disable-next-line no-await-in-loop
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
          if (mediaStream) break;
        } catch (e) {
          // try next constraint
        }
      }

      if (!mediaStream) throw new Error('Could not access any camera');

      setStream(mediaStream);
      setIsCameraOpen(true);
    } catch (err) {
      console.error('Error accessing camera: ', err);
      let errorMessageKey = 'errorCameraGeneric';
      if (err instanceof Error) {
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorMessageKey = 'errorNoCamera';
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMessageKey = 'errorCameraPermission';
        }
      }
      setError(t[errorMessageKey] || 'Could not access camera.');
    }
  };

  // Toggle between front and back camera when camera is open
  const toggleCameraFacing = async () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    // Restart camera with new facing preference
    if (isCameraOpen) {
      // stop current stream
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        setStream(null);
      }
      // Wait a tick then open camera with new facing
      setTimeout(() => { openCamera({ facing: nextFacing }); }, 100);
    }
  };


  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (result && file) {
      setRetranslating(true);
      handleDetectDisease(file, language).finally(() => setRetranslating(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    // Cleanup stream on component unmount
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [stream]);


  const triggerFileSelect = () => fileInputRef.current?.click();

  const ActionButton: React.FC<{
    onClick: () => void;
    icon: React.ReactNode;
    text: string;
    disabled?: boolean;
    title?: string;
  }> = ({ onClick, icon, text, disabled = false, title = '' }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center gap-3 w-full max-w-xs px-6 py-3 border-2 border-dashed rounded-md transition-colors 
        ${disabled
          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
          : 'border-gray-300 text-brand-text-light cursor-pointer hover:bg-brand-green-light hover:border-brand-green hover:text-brand-green-dark'
        }
      `}
    >
      {icon}
      <span className="font-semibold">{text}</span>
    </button>
  );

  return (
    <Card title={t.cropDiseaseDetection} icon={<LeafIcon className="w-6 h-6 text-brand-green" />}>
      <div className="flex flex-col h-full">
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        {!selectedImage && !isCameraOpen && (
          <div className="flex-grow flex flex-col items-center justify-center gap-4 p-8">
            <ActionButton onClick={triggerFileSelect} icon={<UploadIcon className="w-8 h-8" />} text={t.uploadFromFile} />
            <ActionButton
              onClick={openCamera}
              icon={<CameraIcon className="w-8 h-8" />}
              text={t.useCamera}
              disabled={!cameraAvailable}
              title={!cameraAvailable ? t.errorNoCamera : ''}
            />
          </div>
        )}

        {isCameraOpen && (
          <div className="flex-grow flex flex-col items-center justify-center">
            <div className="relative w-full h-64 sm:h-80 rounded-lg overflow-hidden border border-gray-300 bg-gray-900">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain"></video>
            </div>
            <div className="flex gap-4 mt-4">
              <button onClick={closeCamera} className="px-6 py-2 text-sm font-bold text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors">{t.cancel}</button>
              <button onClick={toggleCameraFacing} className="px-4 py-2 text-sm font-semibold bg-gray-100 border rounded-md hover:bg-gray-200 transition-colors" title={cameraFacing === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}>
                {cameraFacing === 'environment' ? 'Front' : 'Back'}
              </button>
              <button onClick={handleCapture} className="px-8 py-2 text-sm font-bold text-white bg-brand-green rounded-md hover:bg-brand-green-dark transition-colors">{t.capture}</button>
            </div>
          </div>
        )}

        {selectedImage && !isCameraOpen && (
          <div className="relative mb-4 rounded-lg overflow-hidden h-64 sm:h-80 border border-gray-200">
            <img src={selectedImage} alt="Uploaded crop" className="w-full h-full object-cover" />
            {(loading || retranslating) && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <div className="flex items-center gap-2 text-brand-green-dark font-semibold">
                  <div className="w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full animate-spin"></div>
                  <span>{retranslating ? t.retranslating : t.analyzing}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedImage && !loading && !result && !isCameraOpen && (
          <button
            onClick={onDetectClick}
            disabled={loading}
            className="w-full bg-brand-green text-white font-bold py-3 px-4 rounded-md hover:bg-brand-green-dark transition-all duration-200 hover:shadow-lg hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green"
          >
            {t.detect}
          </button>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 text-center bg-red-100 p-3 rounded-lg">
            <p className="text-red-600">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // retry detection for the same file
                  if (file) {
                    setLoading(true);
                    handleDetectDisease(file, language).finally(() => setLoading(false));
                  }
                }}
                disabled={!file || loading}
                className="px-4 py-2 bg-brand-green text-white rounded-md hover:bg-brand-green-dark disabled:opacity-50"
              >
                {t.tryAgain || 'Try again'}
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                className="px-4 py-2 border border-brand-green text-brand-green rounded-md hover:bg-brand-green/10"
              >
                {t.tryAnother || 'Try another'}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
              <h3 className={`text-2xl font-bold font-serif ${!result.isCropDetected || !result.isHealthy ? 'text-brand-brown-dark' : 'text-brand-green-dark'}`}>
                {result.diseaseName}
              </h3>
              <button onClick={handleDetectAnother} className="text-sm font-semibold text-brand-green hover:text-brand-green-dark transition-colors">{t.detectAnother}</button>
            </div>

            {!result.isCropDetected ? (
              <div className="p-4 rounded-lg flex items-center gap-4 bg-red-50">
                <AlertTriangleIcon className="w-8 h-8 text-red-700 flex-shrink-0" />
                <p className="text-red-800 font-medium">{t.noCropDetected}</p>
              </div>
            ) : (
              <>
                <ResultSection icon={<FileTextIcon />} title={t.summary}>
                  <p className="text-brand-text-light text-sm">{result.summary}</p>
                </ResultSection>

                {!result.isHealthy && result.causes?.length > 0 && (
                  <ResultSection icon={<ActivityIcon />} title={t.causes}>
                    <ul className="list-disc list-inside space-y-1 text-brand-text-light text-sm">
                      {result.causes.map((cause, i) => <li key={i}>{cause}</li>)}
                    </ul>
                  </ResultSection>
                )}

                {!result.isHealthy && result.medicines?.length > 0 && (
                  <ResultSection icon={<PillIcon />} title={t.medicines}>
                    <div className="space-y-3">
                      {result.medicines.map((med, i) => (
                        <div key={i} className="p-3 bg-brand-surface rounded-md border border-brand-brown-light">
                          <h5 className="font-semibold text-brand-text font-serif">{med.name}</h5>
                          <p className="text-xs text-brand-text-light mt-1"><strong>{t.dosage}:</strong> {med.typical_dosage_or_application}</p>
                          <p className="text-xs text-brand-text-light mt-1"><strong>{t.notes}:</strong> {med.notes}</p>
                        </div>
                      ))}
                    </div>
                  </ResultSection>
                )}

                {!result.isHealthy && result.precautions?.length > 0 && (
                  <ResultSection icon={<ShieldIcon />} title={t.precautions}>
                    <ul className="list-disc list-inside space-y-1 text-brand-text-light text-sm">
                      {result.precautions.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </ResultSection>
                )}

                {result.disclaimer && (
                  <ResultSection icon={<AlertTriangleIcon />} title={t.disclaimer}>
                    <p className="text-brand-text-light text-xs italic">{result.disclaimer}</p>
                  </ResultSection>
                )}
              </>
            )}
            {result.isCropDetected && !result.isHealthy && (
              <Chat t={t} language={language} analysisResult={result} />
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

const ResultSection: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; }> = ({ title, icon, children }) => (
  <div className="p-3 rounded-md bg-brand-brown-light">
    <div className="flex items-center gap-2 mb-2">
      <div className="w-5 h-5 text-brand-brown-dark">{icon}</div>
      <h4 className="font-semibold text-brand-brown-dark font-serif">{title}</h4>
    </div>
    <div>{children}</div>
  </div>
);

export default DiseaseDetector;
