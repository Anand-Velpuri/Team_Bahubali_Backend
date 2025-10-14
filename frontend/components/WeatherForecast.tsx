import React, { useState, useEffect, useCallback } from 'react';
import Card from './shared/Card';
import SunIcon from './icons/SunIcon';
import CloudIcon from './icons/CloudIcon';
import CloudRainIcon from './icons/CloudRainIcon';
import ThermometerIcon from './icons/ThermometerIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import { Language, WeatherInfo } from '../types';
import { WEATHER_API_KEY } from '../constants';


interface WeatherForecastProps {
  t: Record<string, string>;
  language: Language;
}

const WeatherIcon: React.FC<{ iconCode: string }> = ({ iconCode }) => {
  const iconPrefix = iconCode.slice(0, 2);
  switch (iconPrefix) {
    case '01': return <SunIcon className="w-8 h-8 text-brand-accent" />;
    case '02':
    case '03':
    case '04': return <CloudIcon className="w-8 h-8 text-brand-text-light" />;
    case '09':
    case '10':
    case '11': return <CloudRainIcon className="w-8 h-8 text-brand-brown" />;
    default: return <CloudIcon className="w-8 h-8 text-gray-400" />;
  }
};

const WeatherForecast: React.FC<WeatherForecastProps> = ({ t, language }) => {
  const [weatherData, setWeatherData] = useState<WeatherInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);


  const fetchWeatherData = useCallback(async (latitude: number, longitude: number) => {
    setLoading(true);
    setError(null);

    // FIX: Removed check for placeholder API key as a real key is provided.
    if (!WEATHER_API_KEY) {
      setError(t.weatherErrorNoKey);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=metric&lang=${language}`);
      if (!response.ok) {
        throw new Error('Failed to fetch weather data from OpenWeather API.');
      }
      const data = await response.json();

      const dailyForecasts: { [key: string]: any } = {};
      data.list.forEach((item: any) => {
        const date = item.dt_txt.split(' ')[0];
        // Only store the first forecast for each day.
        if (!dailyForecasts[date]) {
          dailyForecasts[date] = item;
        }
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const dayAfter = new Date(today);
      dayAfter.setDate(today.getDate() + 2);

      const toKey = (d: Date) => d.toISOString().split('T')[0];
      const targetKeys = [toKey(today), toKey(tomorrow), toKey(dayAfter)];

      const availableKeys = Object.keys(dailyForecasts).sort();
      const picked: any[] = [];
      const usedKeys = new Set<string>();

      // For each target day, prefer exact key; otherwise pick the next available future key not used.
      for (const tk of targetKeys) {
        if (dailyForecasts[tk] && !usedKeys.has(tk)) {
          picked.push(dailyForecasts[tk]);
          usedKeys.add(tk);
          continue;
        }

        // find next available key greater than tk
        const candidateKey = availableKeys.find(k => k >= tk && !usedKeys.has(k));
        if (candidateKey) {
          picked.push(dailyForecasts[candidateKey]);
          usedKeys.add(candidateKey);
          continue;
        }

        // fall back: any unused key
        const anyKey = availableKeys.find(k => !usedKeys.has(k));
        if (anyKey) {
          picked.push(dailyForecasts[anyKey]);
          usedKeys.add(anyKey);
          continue;
        }

        picked.push(null);
      }

      const dayDates = [today, tomorrow, dayAfter];

      const formattedData = picked.map((item: any, idx: number): WeatherInfo => {
        const dayLabelFallback = new Intl.DateTimeFormat(language, { weekday: 'long' }).format(dayDates[idx]);
        const dayLabel = idx === 0 ? t.today : idx === 1 ? t.tomorrow : (t.dayAfterTomorrow || dayLabelFallback);

        if (!item) {
          return {
            day: dayLabel,
            temp: 0,
            condition: '',
            icon: '01d',
          };
        }

        return {
          day: dayLabel,
          temp: Math.round(item.main.temp),
          condition: item.weather[0].description,
          icon: item.weather[0].icon,
        };
      });

      setWeatherData(formattedData.slice(0, 3));
    } catch (err) {
      setError(t.weatherErrorApi);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [language, t.today, t.tomorrow, t.dayAfterTomorrow, t.weatherErrorApi, t.weatherErrorNoKey]);

  useEffect(() => {

    if (!navigator.geolocation) {
      setError(t.weatherErrorLocation);
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchWeatherData(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        console.error(`Geolocation error: Code ${err.code} - ${err.message}`);
        let errorMessage = t.weatherErrorLocation;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = t.weatherErrorPermissionDenied;
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = t.weatherErrorPositionUnavailable;
            break;
          case err.TIMEOUT:
            errorMessage = t.weatherErrorTimeout;
            break;
        }
        setError(errorMessage);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [fetchWeatherData, t.weatherErrorLocation, t.weatherErrorPermissionDenied, t.weatherErrorPositionUnavailable, t.weatherErrorTimeout]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[150px] gap-2">
          <div className="w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full animate-spin"></div>
          <p className="text-brand-text-light">{t.weatherLoading}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center text-center h-full min-h-[150px] gap-3 p-4 bg-red-50 rounded-lg">
          <AlertTriangleIcon className="w-8 h-8 text-red-500" />
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      );
    }

    if (weatherData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center text-center h-full min-h-[150px] gap-3 p-4">
          <p className="text-brand-text-light">No weather data to display.</p>
        </div>
      )
    }

    return (
      <div className="space-y-3 animate-fade-in">
        {weatherData.map((weather) => (
          <div key={weather.day} className="flex justify-between items-center p-3 bg-brand-green-light rounded-lg">
            <div className="flex items-center gap-3">
              <WeatherIcon iconCode={weather.icon} />
              <div>
                <p className="font-semibold text-brand-text">{weather.day}</p>
                <p className="text-sm text-brand-text-light capitalize">{weather.condition}</p>
              </div>
            </div>
            <p className="text-lg font-bold text-brand-green-dark">{weather.temp}°C</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card title={t.weatherForecast} icon={<ThermometerIcon className="w-6 h-6 text-brand-green" />}>
      {renderContent()}
    </Card>
  );
};

export default WeatherForecast;