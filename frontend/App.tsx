import React, { useState } from 'react';
import Header from './components/Header';
import DiseaseDetector from './components/DiseaseDetector';
import WeatherForecast from './components/WeatherForecast';
import { TRANSLATIONS } from './constants';
import { Language } from './types';

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>('en');

  const t = TRANSLATIONS[language];

  return (
    <div className="min-h-screen bg-brand-background text-brand-text font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <Header language={language} setLanguage={setLanguage} t={t} />
        <main className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <DiseaseDetector t={t} language={language} />
            </div>
            <div className="flex flex-col gap-8">
              <WeatherForecast t={t} language={language} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
