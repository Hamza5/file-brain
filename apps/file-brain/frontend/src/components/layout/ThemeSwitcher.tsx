import React from 'react';
import { Button } from 'primereact/button';
import { useTheme } from '../../context/ThemeContext';

export const ThemeSwitcher: React.FC = () => {
  const { themeMode, setThemeMode } = useTheme();

  const cycleTheme = () => {
    const modes: Array<'light' | 'dark' | 'auto'> = ['light', 'dark', 'auto'];
    const currentIndex = modes.indexOf(themeMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setThemeMode(modes[nextIndex]);
  };

  const getIcon = () => {
    switch (themeMode) {
      case 'light':
        return 'fa-solid fa-sun';
      case 'dark':
        return 'fa-solid fa-moon';
      case 'auto':
        return 'fa-solid fa-circle-half-stroke';
    }
  };

  const getTooltip = () => {
    switch (themeMode) {
      case 'light':
        return 'Light mode (click to switch to dark)';
      case 'dark':
        return 'Dark mode (click to switch to auto)';
      case 'auto':
        return 'Auto mode (follows system preference, click to switch to light)';
    }
  };

  return (
    <Button
      icon={getIcon()}
      rounded
      text
      onClick={cycleTheme}
      tooltip={getTooltip()}
      tooltipOptions={{ position: 'bottom' }}
      aria-label="Toggle theme"
      className="p-button-text"
      style={{
        width: '2.5rem',
        height: '2.5rem',
      }}
    />
  );
};
