import React, { useState, useRef, useEffect } from 'react';
import './Autocomplete.css';

interface AutocompleteItem {
  id: string | number;
  label: string;
  sublabel?: string;
}

interface AutocompleteProps {
  items: AutocompleteItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

const Autocomplete: React.FC<AutocompleteProps> = ({ items, value, onChange, placeholder }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive display text from selected value
  const selectedItem = items.find(i => String(i.id) === value);

  useEffect(() => {
    if (selectedItem) {
      setQuery(selectedItem.label + (selectedItem.sublabel ? ` (${selectedItem.sublabel})` : ''));
    } else {
      setQuery('');
    }
  }, [value, selectedItem]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top,
        maxHeight: 200,
      });
    }
  }, [open]);

  const filtered = items.filter(item => {
    const q = query.toLowerCase();
    return item.label.toLowerCase().includes(q) || (item.sublabel && item.sublabel.toLowerCase().includes(q));
  });

  const handleSelect = (id: string | number) => {
    onChange(String(id));
    setOpen(false);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        handleSelect(filtered[highlightIndex].id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightIndex(-1);
    }
  };

  return (
    <div className="autocomplete" ref={wrapperRef}>
      <input
        ref={inputRef}
        className="autocomplete-input"
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlightIndex(-1);
          // Clear the selection when user types
          if (value) onChange('');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={!value}
      />
      {open && (
        <div className="autocomplete-dropdown" style={dropdownStyle}>
          {filtered.length === 0 ? (
            <div className="autocomplete-empty">No matches found</div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={item.id}
                className={`autocomplete-item ${idx === highlightIndex ? 'highlighted' : ''}`}
                onMouseDown={() => handleSelect(item.id)}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                <span className="autocomplete-item-label">{item.label}</span>
                {item.sublabel && <span className="autocomplete-item-sublabel">{item.sublabel}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Autocomplete;
