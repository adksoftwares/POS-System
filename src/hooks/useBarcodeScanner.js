import { useEffect, useRef } from 'react';

// Physical scanners mimic rapid keyboard typing. 
// A human typing usually takes >50ms per stroke. A scanner is <20ms.
export function useBarcodeScanner(onScan) {
  const buffer = useRef('');
  const lastKeyTime = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore modifier keys
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime.current;

      // If it's been more than 50ms since the last keystroke, it's likely a human typing.
      // Clear the buffer to prevent polluting it with manual typing.
      if (timeDiff > 50) {
        buffer.current = '';
      }

      lastKeyTime.current = currentTime;

      // If Enter is pressed, it might be the end of a scan
      if (e.key === 'Enter') {
        if (buffer.current.length > 3 && timeDiff <= 50) {
          // Valid rapid scan sequence ending in Enter
          e.preventDefault(); // Prevent Enter from submitting forms
          onScan(buffer.current);
          buffer.current = ''; // Clear after successful scan
        }
      } else {
        // Only append single character keys (ignore Backspace, Tab, etc.)
        if (e.key.length === 1) {
          buffer.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);
}
