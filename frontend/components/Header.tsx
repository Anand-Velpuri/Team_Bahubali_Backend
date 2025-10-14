import React from 'react';
import { Language } from '../types';
import SproutIcon from './icons/SproutIcon';
import { LANGUAGES } from '../constants';
import ChevronDownIcon from './icons/ChevronDownIcon';

interface HeaderProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Record<string, string>;
}

const Header: React.FC<HeaderProps> = ({ language, setLanguage, t }) => {
  return (
    <header className="flex justify-between items-center pb-4 border-b border-brand-brown-dark/20">
      <div className="flex items-center gap-3">
        <SproutIcon className="h-8 w-8 text-brand-green" />
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-green-dark font-serif">{t.title}</h1>
      </div>
      <div className="relative">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          className="appearance-none text-sm font-medium bg-brand-green/10 text-brand-green-dark pl-4 pr-10 py-2 rounded-full cursor-pointer hover:bg-brand-green/20 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-green"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="w-5 h-5 text-brand-green-dark absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </header>
  );
};

export default Header;