import React, { createContext, useContext, useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  effectiveTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    // Initialize from localStorage or default to 'auto' (follow system preference)
    const stored = localStorage.getItem('theme-mode');
    return (stored as ThemeMode) || 'auto';
  });

  // Determine the effective theme based on mode and system preference
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  // Listen to system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateEffectiveTheme = () => {
      if (themeMode === 'auto') {
        setEffectiveTheme(mediaQuery.matches ? 'dark' : 'light');
      } else {
        setEffectiveTheme(themeMode);
      }
    };

    // Initial update
    updateEffectiveTheme();

    // Listen for changes
    const handler = () => updateEffectiveTheme();
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, [themeMode]);

  // Apply theme when effectiveTheme changes
  useEffect(() => {
    const currentThemeName = effectiveTheme === 'light' 
      ? 'lara-light-cyan-theme' 
      : 'lara-dark-cyan-theme';
    
    const newThemePath = `/themes/${currentThemeName}.css`;
    
    // Directly update link element
    const linkElement = document.getElementById('theme-link') as HTMLLinkElement;
    if (linkElement && !linkElement.href.includes(currentThemeName)) {
      linkElement.href = newThemePath;
      console.log(`Theme changed to ${currentThemeName}`);
    }
  }, [effectiveTheme]);

  const setThemeMode = (mode: ThemeMode) => {
    console.log(`Setting theme mode to: ${mode}`);
    setThemeModeState(mode);
    localStorage.setItem('theme-mode', mode);
  };

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
