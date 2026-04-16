const fs = require('fs');

// Patch useAddressPicker.ts
let code = fs.readFileSync('hooks/useAddressPicker.ts', 'utf8');

// remove prevAddressForImeRef, suppressSuggestionFetchRef from UseAddressPickerArgs
code = code.replace(/  suppressSuggestionFetchRef: CurrentRef<boolean>;\n/g, '');
code = code.replace(/  prevAddressForImeRef: CurrentRef<string>;\n/g, '');

// remove them from destructured props
code = code.replace(/  suppressSuggestionFetchRef,\n/g, '');
code = code.replace(/  prevAddressForImeRef,\n/g, '');

// add them as refs inside useAddressPicker
code = code.replace(/export function useAddressPicker\(\{[\s\S]*?\}\: UseAddressPickerArgs\) \{/, match => {
  return match + "\n  const suppressSuggestionFetchRef = React.useRef(false);\n  const prevAddressForImeRef = React.useRef(arguments[0].value || '');\n";
});

// Since React might not be imported, let's add it if needed
if (!code.includes('import React')) {
  code = "import React from 'react';\n" + code;
}

// Add an effect to keep prevAddressForImeRef in sync when value changes externally
let effectCode = `
  React.useEffect(() => {
    prevAddressForImeRef.current = value;
  }, [value]);
`;
code = code.replace(/  const q = useMemo/, effectCode + "\n  const q = useMemo");

fs.writeFileSync('hooks/useAddressPicker.ts', code);

// Patch App.tsx
let appCode = fs.readFileSync('App.tsx', 'utf8');
appCode = appCode.replace(/  const prevStartAddressForImeRef = useRef\(''\);\n/g, '');
appCode = appCode.replace(/  const prevDestinationAddressForImeRef = useRef\(''\);\n/g, '');
appCode = appCode.replace(/  const suppressStartSuggestionFetchRef = useRef\(false\);\n/g, '');
appCode = appCode.replace(/  const suppressDestinationSuggestionFetchRef = useRef\(false\);\n/g, '');

appCode = appCode.replace(/    suppressSuggestionFetchRef: suppressStartSuggestionFetchRef,\n/g, '');
appCode = appCode.replace(/    prevAddressForImeRef: prevStartAddressForImeRef,\n/g, '');

appCode = appCode.replace(/    suppressSuggestionFetchRef: suppressDestinationSuggestionFetchRef,\n/g, '');
appCode = appCode.replace(/    prevAddressForImeRef: prevDestinationAddressForImeRef,\n/g, '');

appCode = appCode.replace(/        prevStartAddressForImeRef\.current = prefs\.tripStartAddress;\n/g, '');
appCode = appCode.replace(/        prevDestinationAddressForImeRef\.current = prefs\.tripDestinationAddress;\n/g, '');

fs.writeFileSync('App.tsx', appCode);
