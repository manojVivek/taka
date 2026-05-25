'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger' | 'success';
type Size = 'md' | 'sm';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({ variant = 'default', size = 'md', children, className = '', ...rest }: Props) {
  const classes = ['tk-btn'];
  if (variant !== 'default') classes.push(variant);
  if (size === 'sm') classes.push('sm');
  if (className) classes.push(className);
  return (
    <button className={classes.join(' ')} {...rest}>
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
}

export function IconButton({ children, className = '', ...rest }: IconButtonProps) {
  return (
    <button className={`tk-iconbtn${className ? ' ' + className : ''}`} {...rest}>
      {children}
    </button>
  );
}
