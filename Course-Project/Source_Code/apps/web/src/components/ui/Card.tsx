import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-white rounded-lg border border-[#E6E4E4] p-6 shadow-xs font-serif ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
