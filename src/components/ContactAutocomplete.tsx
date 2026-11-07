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

const hasFocus = (el: HTMLElement | null): boolean => el !== null && document.activeElement === el;

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
  // U8 : identifiants propres à chaque champ (Nom, Prénoms et Téléphone partageaient la même liste).
  const listId = `${inputProps.id ?? 'contact'}-suggestions`;
  const optionId = (idx: number) => `${listId}-opt-${idx}`;
  const isListVisible = open && suggestions.length > 0;
  const lastQueryRef = useRef<string>('');
  const justSelectedRef = useRef<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    // QA-UX-02 : une valeur posée par le choix d'un contact (champ sans focus) ne relance pas la
    // recherche ; seule une frappe de l'utilisateur dans ce champ ouvre la liste.
    if (trimmed.length < minChars || !hasFocus(inputRef.current)) {
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
        setOpen(results.length > 0 && hasFocus(inputRef.current));
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
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          if (suggestions.length > 0) setOpen(true);
          inputProps.onFocus?.(e);
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={isListVisible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isListVisible ? optionId(highlight) : undefined}
      />

      {isListVisible && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Contacts du carnet"
          className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-control shadow-pop max-h-72 overflow-auto"
        >
          {loading && (
            <li role="presentation" className="px-3 py-2 text-sm text-ink-muted">Recherche…</li>
          )}
          {suggestions.map((c, idx) => {
            const active = idx === highlight;
            return (
              <li
                key={c.id}
                id={optionId(idx)}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  active ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <BookUser className="h-4 w-4 text-ink-muted flex-shrink-0" aria-hidden="true" />
                  <span className="font-semibold text-ink truncate">
                    {c.lastName} {c.firstName}
                  </span>
                  <span className="text-ink-muted tabular-nums truncate">· {c.phone}</span>
                </div>
                {c.address && (
                  <div className="text-xs text-ink-muted truncate mt-0.5 pl-[22px]">
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
