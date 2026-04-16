import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { AddressSuggestion } from '../clients/geocodingClient';

type CurrentRef<T> = {
  current: T;
};

type UseAddressPickerArgs = {
  // Whether the input is currently allowed to fetch suggestions.
  // This should already incorporate platform-specific focus rules.
  shouldFetch: boolean;

  value: string;
  setValue: (next: string) => void;

  selected: AddressSuggestion | null;
  setSelected: (next: AddressSuggestion | null) => void;

  suggestions: AddressSuggestion[];
  setSuggestions: (next: AddressSuggestion[]) => void;

  searching: boolean;
  setSearching: (next: boolean) => void;

  isFocused: boolean;
  setIsFocused: (next: boolean) => void;

  // Shared between start/destination so blur timers can be suppressed.
  isSelectingSuggestionRef: CurrentRef<boolean>;

  // Prevents the debounce suggestion effect immediately after an IME-driven commit.

  // Stores previous raw input text for IME commit detection.

  fetchAddressSuggestions: (query: string) => Promise<AddressSuggestion[]>;
  resolveAddress: (label: string) => Promise<AddressSuggestion | null>;
  resolveAddressByPlaceId: (placeId: string) => Promise<AddressSuggestion | null>;
};

function isLikelyImeAddressCommit(prev: string, value: string): boolean {
  const trimmed = value.trim();
  const prevTrim = prev.trim();
  if (trimmed.length < 5 || prev === value) {
    return false;
  }
  if (value.length <= prev.length) {
    return false;
  }
  // Heuristic: big jump in length likely indicates IME autocomplete/paste.
  if (value.length - prev.length >= 4) {
    return true;
  }
  return prevTrim.length >= 2 && trimmed.startsWith(prevTrim) && trimmed.length - prevTrim.length >= 5;
}

export function useAddressPicker({
  shouldFetch,
  value,
  setValue,
  selected,
  setSelected,
  suggestions,
  setSuggestions,
  searching,
  setSearching,
  isFocused,
  setIsFocused,
  isSelectingSuggestionRef,
  fetchAddressSuggestions,
  resolveAddress,
  resolveAddressByPlaceId
}: UseAddressPickerArgs) {

  const suppressSuggestionFetchRef = useRef(false);
  const prevAddressForImeRef = useRef(arguments[0].value || '');

  useEffect(() => {
    prevAddressForImeRef.current = value;
  }, [value]);


  React.useEffect(() => {
    prevAddressForImeRef.current = value;
  }, [value]);

  const q = useMemo(() => value.trim(), [value]);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (isSelectingSuggestionRef.current) {
        return;
      }
      setIsFocused(false);
    }, Platform.OS === 'web' ? 220 : 120);
  }, [isSelectingSuggestionRef, setIsFocused]);

  const applySuggestion = useCallback(
    (suggestion: AddressSuggestion, source: 'list' | 'inline', initialText?: string) => {
      const text = initialText ?? suggestion.label;
      if (source === 'list') {
        isSelectingSuggestionRef.current = true;
      }

      setValue(text);
      setSelected(suggestion);

      let latestLabelForIme = text;
      void (async () => {
        try {
          const resolved = await resolveAddressByPlaceId(suggestion.id);
          if (resolved) {
            latestLabelForIme = resolved.label;
            setValue(resolved.label);
            setSelected(resolved);
          }
        } catch {
          // Keep optimistic label; coordinates are validated on save.
        } finally {
          prevAddressForImeRef.current = latestLabelForIme;

          if (source === 'list') {
            isSelectingSuggestionRef.current = false;
          }

          setSuggestions([]);
          setSearching(false);

          if (source === 'list') {
            setIsFocused(false);
            Keyboard.dismiss();
          }
        }
      })();
    },
    [
      isSelectingSuggestionRef,
          resolveAddressByPlaceId,
      setIsFocused,
      setSelected,
      setSearching,
      setSuggestions,
      setValue
    ]
  );

  const handleChangeText = useCallback(
    (nextText: string) => {
      const prev = prevAddressForImeRef.current;
      prevAddressForImeRef.current = nextText;
      const trimmed = nextText.trim();

      const exact = suggestions.find((s) => s.label.trim() === trimmed);
      if (exact) {
        applySuggestion(exact, 'inline', nextText);
        return;
      }

      if (isLikelyImeAddressCommit(prev, nextText)) {
        suppressSuggestionFetchRef.current = true;
        setValue(nextText);
        setSelected(null);
        setSuggestions([]);
        setSearching(true);
        void (async () => {
          try {
            const resolved = await resolveAddress(trimmed);
            if (resolved) {
              setValue(resolved.label);
              setSelected(resolved);
              prevAddressForImeRef.current = resolved.label;
            }
          } catch {
            // Leave text; user can pick from the list after the next fetch.
          } finally {
            setSearching(false);
            suppressSuggestionFetchRef.current = false;
          }
        })();
        return;
      }

      setValue(nextText);
      setSelected(null);
    },
    [
      applySuggestion,
          resolveAddress,
      setSelected,
      setSearching,
      setSuggestions,
      setValue,
          suggestions
    ]
  );

  useEffect(() => {
    let cancelled = false;

    if (!shouldFetch) {
      setSuggestions([]);
      setSearching(false);
      return () => {
        cancelled = true;
      };
    }

    if (selected && selected.label.trim() === q) {
      setSuggestions([]);
      setSearching(false);
      return () => {
        cancelled = true;
      };
    }

    if (suppressSuggestionFetchRef.current) {
      return () => {
        cancelled = true;
      };
    }

    if (q.length < 2) {
      setSuggestions([]);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const results = await fetchAddressSuggestions(q);
        if (!cancelled) {
          setSuggestions(results);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    fetchAddressSuggestions,
    q,
    selected,
    setSearching,
    setSuggestions,
    shouldFetch,
    suppressSuggestionFetchRef
  ]);

  return {
    isFocused,
    handleBlur,
    handleChangeText,
    applySuggestion
  };
}

