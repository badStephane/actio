import React, { useEffect, useRef, useState } from 'react';
import { BookUser } from 'lucide-react';
import { Contact, searchContacts } from '../utils/contacts';

interface ContactAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (contact: Contact) => void;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  /** Minimum characters before suggestions appear */
  minChars?: number;
  /** Whether to enable suggestions (e.g. disabled in edit mode) */
  enabled?: boolean;
}

const DEBOUNCE_MS = 180;

const ContactAutocomplete: React.FC<ContactAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  inputProps,
  minChars = 2,
  enabled = true,
}) => {
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastQueryRef = useRef<string>('');
  const justSelectedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (justSelectedRef.current) {
      // Suppress one search cycle right after the user picked a suggestion
      justSelectedRef.current = false;
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < minChars) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      lastQueryRef.current = trimmed;
      setLoading(true);
      try {
        const results = await searchContacts(trimmed, 8);
        // Drop result if a newer query started
        if (lastQueryRef.current !== trimmed) return;
        setSuggestions(results);
        setOpen(results.length > 0);
        setHighlight(0);
      } catch (err) {
        console.error('Error searching contacts:', err);
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [value, enabled, minChars]);

  // Click outside closes the dropdown
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const pick = (contact: Contact) => {
    justSelectedRef.current = true;
    setOpen(false);
    setSuggestions([]);
    onSelect(contact);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = suggestions[highlight];
      if (c) pick(c);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          if (suggestions.length > 0) setOpen(true);
          inputProps.onFocus?.(e);
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="contact-suggestions"
        aria-autocomplete="list"
      />

      {open && suggestions.length > 0 && (
        <ul
          id="contact-suggestions"
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-auto"
        >
          {loading && (
            <li className="px-2 py-1.5 text-xs text-gray-400">Recherche…</li>
          )}
          {suggestions.map((c, idx) => {
            const active = idx === highlight;
            return (
              <li
                key={c.id}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={`px-2 py-1.5 text-xs cursor-pointer ${
                  active ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <BookUser className="h-3 w-3 text-gray-400 flex-shrink-0" />
                  <span className="font-medium text-gray-900 truncate">
                    {c.lastName} {c.firstName}
                  </span>
                  <span className="text-gray-500 tabular-nums truncate">· {c.phone}</span>
                </div>
                {c.address && (
                  <div className="text-[11px] text-gray-500 truncate mt-0.5 pl-[18px]">
                    {c.address}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ContactAutocomplete;
