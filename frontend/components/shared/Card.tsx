
import React from 'react';

interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ title, icon, children, className = '' }) => {
  return (
    <div className={`bg-brand-surface rounded-lg shadow-md shadow-brand-brown-dark/10 p-6 flex flex-col ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <h2 className="text-xl font-semibold text-brand-green-dark font-serif">{title}</h2>
      </div>
      <div className="flex-grow">
        {children}
      </div>
    </div>
  );
};

export default Card;