import React from 'react';
import './CharacterSelector.css';

/**
 * Character Selector Component
 *
 * Displays a grid of available characters for selection.
 * Supports multi-select with visual feedback.
 *
 * Props:
 * - characters: Array of character objects
 * - selectedCharacters: Array of selected character names
 * - onSelectionChange: Callback function when selection changes
 * - maxSelection: Maximum number of characters that can be selected
 * - label: Label for the selector section
 */
function CharacterSelector({
  characters,
  selectedCharacters,
  onSelectionChange,
  maxSelection = 5,
  label,
  isPedestrianSelector = false
}) {
  const handleCharacterClick = (characterName) => {
    if (selectedCharacters.includes(characterName)) {
      // Remove character if already selected
      onSelectionChange(selectedCharacters.filter(c => c !== characterName));
    } else {
      // Special handling for barricade (pedestrians only)
      if (characterName === 'Barricade' && isPedestrianSelector) {
        // Barricade must be the only selection
        onSelectionChange(['Barricade']);
      } else if (isPedestrianSelector && selectedCharacters.includes('Barricade')) {
        // If barricade is selected, replace it with new selection
        onSelectionChange([characterName]);
      } else {
        // Normal selection logic
        if (selectedCharacters.length < maxSelection) {
          onSelectionChange([...selectedCharacters, characterName]);
        }
      }
    }
  };

  const getCharacterEmoji = (name) => {
    const emojiMap = {
      'Man': '👨',
      'Woman': '👩',
      'Pregnant': '🤰',
      'Stroller': '👶',
      'OldMan': '👴',
      'OldWoman': '👵',
      'Boy': '👦',
      'Girl': '👧',
      'Homeless': '🧑',
      'LargeWoman': '👩',
      'LargeMan': '👨',
      'Criminal': '🦹',
      'MaleExecutive': '👔',
      'FemaleExecutive': '👩‍💼',
      'FemaleAthlete': '🏃‍♀️',
      'MaleAthlete': '🏃‍♂️',
      'FemaleDoctor': '👩‍⚕️',
      'MaleDoctor': '👨‍⚕️',
      'Dog': '🐕',
      'Cat': '🐈',
      'Barricade': '🚧'
    };
    return emojiMap[name] || '👤';
  };

  const getCategoryColor = (category) => {
    const colorMap = {
      'adults': '#3498db',
      'elderly': '#9b59b6',
      'children': '#f39c12',
      'special': '#e74c3c',
      'professionals': '#2ecc71',
      'animals': '#95a5a6',
      'obstacles': '#e67e22'
    };
    return colorMap[category] || '#7f8c8d';
  };

  return (
    <div className="character-selector">
      <div className="selector-header">
        <h3 className="selector-label">{label}</h3>
        <span className="selection-count">
          {selectedCharacters.length} / {maxSelection} selected
        </span>
      </div>

      <div className="character-grid">
        {characters.map((character) => {
          // Don't show Barricade as a passenger option
          if (!isPedestrianSelector && character.name === 'Barricade') {
            return null;
          }

          const isSelected = selectedCharacters.includes(character.name);

          // Special barricade logic for pedestrians
          let isDisabled = !isSelected && selectedCharacters.length >= maxSelection;
          if (isPedestrianSelector) {
            // If barricade is selected, disable all other characters
            if (selectedCharacters.includes('Barricade') && character.name !== 'Barricade') {
              isDisabled = true;
            }
            // If other characters are selected, disable barricade
            if (selectedCharacters.length > 0 && !selectedCharacters.includes('Barricade') && character.name === 'Barricade') {
              isDisabled = true;
            }
          }

          return (
            <div
              key={character.name}
              className={`character-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => !isDisabled && handleCharacterClick(character.name)}
              style={{
                borderColor: isSelected ? getCategoryColor(character.category) : '#ddd'
              }}
            >
              <div className="character-emoji">
                {getCharacterEmoji(character.name)}
              </div>
              <div className="character-name">{character.name}</div>
              <div className="character-category">{character.category}</div>
              {isSelected && (
                <div className="selected-badge">✓</div>
              )}
            </div>
          );
        })}
      </div>

      {selectedCharacters.length > 0 && (
        <div className="selected-characters">
          <strong>Selected:</strong>
          <div className="selected-list">
            {selectedCharacters.map((name, index) => (
              <span key={index} className="selected-chip">
                {getCharacterEmoji(name)} {name}
                <button
                  className="remove-btn"
                  onClick={() => handleCharacterClick(name)}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CharacterSelector;
