import { useEffect, useCallback, useRef } from 'react';
import { documentEventService } from '../services/eventService';
import type { DocumentEvent } from '../services/eventService';
import { showSnackbar } from '../components/Snackbar';

interface UseDocumentEventsOptions {
  onDocumentUpdated?: () => void;
  onShareChanged?: () => void;
  onAccessRevoked?: () => void;
  showNotifications?: boolean;
}

export function useDocumentEvents(
  documentId: string | undefined,
  options: UseDocumentEventsOptions = {}
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleEvents = useCallback((events: DocumentEvent[]) => {
    const opts = optionsRef.current;

    for (const event of events) {
      if (event.action === 'ACCESS_REVOKED') {
        if (opts.showNotifications) {
          showSnackbar('Your access to this document has been revoked', 'error');
        }
        opts.onAccessRevoked?.();
        continue;
      }

      if (opts.showNotifications && event.actor_name) {
        let message = '';
        switch (event.action) {
          case 'EDIT':
            message = `${event.actor_name} updated this document`;
            break;
          case 'SHARE':
            message = `${event.actor_name} modified sharing settings`;
            break;
          case 'VIEW':
            message = `${event.actor_name} viewed this document`;
            break;
          default:
            message = `${event.actor_name} performed an action`;
        }
        showSnackbar(message, 'info');
      }

      switch (event.action) {
        case 'EDIT':
          opts.onDocumentUpdated?.();
          break;
        case 'SHARE':
          opts.onShareChanged?.();
          break;
      }
    }
  }, []);

  useEffect(() => {
    if (!documentId) return;

    documentEventService.start(documentId);
    const unsubscribe = documentEventService.subscribe(handleEvents);

    return () => {
      unsubscribe();
      documentEventService.stop();
    };
  }, [documentId, handleEvents]);
}
