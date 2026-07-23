import { useEffect } from 'react';
import type { UseFormTrigger } from 'react-hook-form';

const useAutoFocus = (trigger: UseFormTrigger<any>) => {
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      const form = document.querySelector('form');
      if (!form) return;

      const focusableElements = Array.from(
        form.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
        >(
          "input:not([disabled]):not([style*='display: none']), select:not([disabled]):not([style*='display: none']), textarea:not([disabled]):not([style*='display: none']), button[type='submit']:not([disabled]):not([style*='display: none'])",
        ),
      );

      const { activeElement } = document;
      const currentIndex = focusableElements.indexOf(
        activeElement as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | HTMLButtonElement,
      );

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (activeElement instanceof HTMLInputElement) {
          const fieldName = activeElement.name;

          if (fieldName) {
            const isValid = await trigger(fieldName);

            if (!isValid) {
              event.preventDefault();
              return;
            }
          }
        }

        if (event.key === 'Enter') {
          if (activeElement instanceof HTMLButtonElement && activeElement.type === 'submit') {
            (activeElement as HTMLButtonElement).click();
            event.preventDefault();
            return;
          }
          let nextIndex = currentIndex + 1;

          if (nextIndex >= focusableElements.length) nextIndex = 0;

          focusableElements[nextIndex].focus();
          event.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [trigger]);
};

export default useAutoFocus;

