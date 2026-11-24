import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...props
}) => {
  // Base sizing maintaining 44px minimum touch targets
  const sizeClasses = {
    sm: 'min-h-[40px] px-3.5 py-2 text-xs',
    md: 'min-h-[44px] px-4 py-2.5 text-sm',
    lg: 'min-h-[48px] px-6 py-3 text-base',
  }[size];

  // Institutional examination palette (Times New Roman white/crimson/black):
  // Primary: deep crimson #981B2B with crisp white text
  // Secondary: clean white with subtle border #E6E4E4 and near-black text
  // Ghost: text only with crimson soft tint hover
  // Danger: crimson red outline
  const variantClasses = {
    primary:
      'bg-[#8B1D24] text-white font-bold hover:bg-[#73171D] border border-transparent shadow-xs disabled:opacity-50 disabled:cursor-not-allowed',
    secondary:
      'border border-[#E6E4E4] text-[#161616] bg-white hover:bg-[#F8F8F7] font-medium disabled:opacity-50 disabled:cursor-not-allowed',
    ghost:
      'text-[#161616] hover:bg-[#981B2B]/10 font-medium disabled:opacity-40 disabled:cursor-not-allowed',
    danger:
      'border border-[#8B1D24] text-[#8B1D24] bg-white hover:bg-red-50 font-medium disabled:opacity-50 disabled:cursor-not-allowed',
  }[variant];

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-md transition-colors cursor-pointer select-none whitespace-nowrap shrink-0 font-serif focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B1D24] focus-visible:ring-offset-2 ${
        fullWidth ? 'w-full' : ''
      } ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
