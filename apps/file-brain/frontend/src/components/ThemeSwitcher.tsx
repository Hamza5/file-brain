import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Button } from 'primereact/button';
import { Tooltip } from 'primereact/tooltip';

export const ThemeSwitcher: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const getNextTheme = () => {
    if (theme === 'light') return 'dark';
    if (theme === 'dark') return 'auto';
    return 'light';
  };

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return 'fa-solid fa-sun';
      case 'dark':
        return 'fa-solid fa-moon';
      case 'auto':
        return 'fa-solid fa-circle-half-stroke';
    }
  };

  const getTooltip = () => {
    switch (theme) {
      case 'light':
        return 'Switch to Dark Mode';
      case 'dark':
        return 'Switch to Auto Mode';
      case 'auto':
        return 'Switch to Light Mode';
    }
  };

  return (
    <>
      <Tooltip target=".theme-switcher-btn" />
      <Button
        icon={getIcon()}
        className="p-button-rounded p-button-text theme-switcher-btn"
        onClick={() => setTheme(getNextTheme())}
        data-pr-tooltip={getTooltip()}
        data-pr-position="bottom"
        aria-label="Switch Theme"
      />
    </>
  );
};
