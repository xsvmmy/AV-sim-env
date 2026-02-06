import React, { useState, useEffect } from 'react';
import ScenarioConfig from './components/ScenarioConfig';
import Visualization from './components/Visualization';
import { fetchCharacters } from './utils/api';
import './App.css';

/**
 * Main Application Component
 *
 * Manages the overall application state and navigation between
 * configuration and visualization views.
 */
function App() {
  const [characters, setCharacters] = useState([]);
  const [currentView, setCurrentView] = useState('config'); // 'config' or 'visualization'
  const [currentScenario, setCurrentScenario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load available characters on mount
  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      setLoading(true);
      const data = await fetchCharacters();
      setCharacters(data);
      setError(null);
    } catch (err) {
      setError('Failed to load character types. Please refresh the page.');
      console.error('Error loading characters:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScenarioCreated = (scenario) => {
    setCurrentScenario(scenario);
    setCurrentView('visualization');
  };

  const handleBackToConfig = () => {
    setCurrentView('config');
    setCurrentScenario(null);
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading application...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚗 Autonomous Vehicle Ethics Simulator</h1>
        <p className="app-subtitle">
          Configure and visualize ethical dilemmas for autonomous vehicles
        </p>
      </header>

      {error && (
        <div className="container">
          <div className="error-message">{error}</div>
        </div>
      )}

      <main>
        {currentView === 'config' ? (
          <ScenarioConfig
            characters={characters}
            onScenarioCreated={handleScenarioCreated}
          />
        ) : (
          <Visualization
            scenario={currentScenario}
            onBack={handleBackToConfig}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>AV Ethics Simulator v1.0 | Built for ethical AI research and education</p>
      </footer>
    </div>
  );
}

export default App;
