const fs = require('fs');

let inputFile = fs.readFileSync('components/AddressSuggestionInput.tsx', 'utf8');

const newInterface = `
export type AddressUIModel = {
  value: string;
  isFocused: boolean;
  suggestions: AddressSuggestion[];
  statusText: string;
  statusOk: boolean;
  metaHintText?: string | null;
};
`;

inputFile = inputFile.replace(/type AddressSuggestionInputProps = \{/, newInterface + '\ntype AddressSuggestionInputProps = {\n  ui: AddressUIModel;');
inputFile = inputFile.replace(/  value: string;\n/, '');
inputFile = inputFile.replace(/  isInputFocused: boolean;\n/, '');
inputFile = inputFile.replace(/  suggestions: AddressSuggestion\[\];\n/, '');
inputFile = inputFile.replace(/  statusText: string;\n/, '');
inputFile = inputFile.replace(/  statusOk: boolean;\n/, '');
inputFile = inputFile.replace(/  metaHintText\?: string \| null;\n/, '');

inputFile = inputFile.replace(/export function AddressSuggestionInput\(\{\n/, 'export function AddressSuggestionInput({\n  ui,\n');
inputFile = inputFile.replace(/  value,\n/, '');
inputFile = inputFile.replace(/  isInputFocused,\n/, '');
inputFile = inputFile.replace(/  suggestions,\n/, '');
inputFile = inputFile.replace(/  statusText,\n/, '');
inputFile = inputFile.replace(/  statusOk,\n/, '');
inputFile = inputFile.replace(/  metaHintText,\n/, '');

inputFile = inputFile.replace(/value=\{value\}/, 'value={ui.value}');
inputFile = inputFile.replace(/\{metaHintText \? <Text style=\{styles.metaHint\}>\{metaHintText\}<\/Text> : null\}/, '{ui.metaHintText ? <Text style={styles.metaHint}>{ui.metaHintText}</Text> : null}');
inputFile = inputFile.replace(/statusText \? \(/, 'ui.statusText ? (');
inputFile = inputFile.replace(/statusOk && styles\.addressStatusPillOk/, 'ui.statusOk && styles.addressStatusPillOk');
inputFile = inputFile.replace(/suggestions\.length === 0/, 'ui.suggestions.length === 0');
inputFile = inputFile.replace(/statusOk && statusOkTextStyle/, 'ui.statusOk && statusOkTextStyle');
inputFile = inputFile.replace(/>\{statusText\}<\/Text>/, '>{ui.statusText}</Text>');
inputFile = inputFile.replace(/showSuggestions = suggestions\.length > 0 && \(Platform\.OS !== 'web' \|\| isInputFocused\)/, "showSuggestions = ui.suggestions.length > 0 && (Platform.OS !== 'web' || ui.isFocused)");
inputFile = inputFile.replace(/suggestions\.map\(/, 'ui.suggestions.map(');

fs.writeFileSync('components/AddressSuggestionInput.tsx', inputFile);

let appFile = fs.readFileSync('App.tsx', 'utf8');

// Start address replace
appFile = appFile.replace(/value=\{tripStartAddress\}\n\s+onChangeText/s, 'ui={{\n                      value: tripStartAddress,\n                      isFocused: isStartInputFocused,\n                      suggestions: startSuggestions,\n                      statusText: startStatusText,\n                      statusOk: startAddressSelected,\n                      metaHintText: searchingStart ? "Searching addresses..." : null\n                    }}\n                    onChangeText');

appFile = appFile.replace(/isInputFocused=\{isStartInputFocused\}\n\s+suggestions=\{startSuggestions\}\n\s+statusText=\{startStatusText\}\n\s+statusOk=\{startAddressSelected\}\n\s+statusOkTextStyle/s, 'statusOkTextStyle');

appFile = appFile.replace(/styles=\{styles\}\n\s+metaHintText=\{searchingStart \? 'Searching addresses\.\.\.' : null\}\n/s, 'styles={styles}\n');

// Dest address replace
appFile = appFile.replace(/value=\{tripDestinationAddress\}\n\s+onChangeText/s, 'ui={{\n                      value: tripDestinationAddress,\n                      isFocused: isDestinationInputFocused,\n                      suggestions: destinationSuggestions,\n                      statusText: destinationStatusText ?? "",\n                      statusOk: destinationAddressSelected,\n                      metaHintText: searchingDestination ? "Searching addresses..." : null\n                    }}\n                    onChangeText');

appFile = appFile.replace(/isInputFocused=\{isDestinationInputFocused\}\n\s+suggestions=\{destinationSuggestions\}\n\s+statusText=\{destinationStatusText \?\? ''\}\n\s+statusOk=\{destinationAddressSelected\}\n\s+statusOkTextStyle/s, 'statusOkTextStyle');

appFile = appFile.replace(/styles=\{styles\}\n\s+metaHintText=\{searchingDestination \? 'Searching addresses\.\.\.' : null\}\n/s, 'styles={styles}\n');

fs.writeFileSync('App.tsx', appFile);
