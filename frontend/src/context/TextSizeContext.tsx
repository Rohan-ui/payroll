import React, { createContext, useContext, useState, useEffect } from 'react';

export type TextSize = 'normal' | 'large' | 'xlarge';

interface TextSizeContextType {
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
}

const TextSizeContext = createContext<TextSizeContextType | undefined>(undefined);

export const TextSizeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [textSize, setTextSizeState] = useState<TextSize>(() => {
    return (localStorage.getItem('rnd_text_size') as TextSize) || 'normal';
  });

  const setTextSize = (size: TextSize) => {
    setTextSizeState(size);
    localStorage.setItem('rnd_text_size', size);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-text-size', textSize);
  }, [textSize]);

  return (
    <TextSizeContext.Provider value={{ textSize, setTextSize }}>
      {children}
    </TextSizeContext.Provider>
  );
};

export const useTextSize = (): TextSizeContextType => {
  const context = useContext(TextSizeContext);
  if (!context) {
    throw new Error('useTextSize must be used within a TextSizeProvider');
  }
  return context;
};
