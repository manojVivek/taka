'use client';

import type { InputHTMLAttributes, ReactNode, CSSProperties } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
  wrapperStyle?: CSSProperties;
}

export function Input({ leading, trailing, wrapperStyle, className, ...rest }: Props) {
  return (
    <label className="tk-input" style={wrapperStyle}>
      {leading}
      <input className={className} {...rest} />
      {trailing}
    </label>
  );
}
