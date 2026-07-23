type NestedErrors = {
  [key: string]: string[] | NestedErrors | NestedErrors[];
};

export const removeNestedField = (obj: any, path: string): any => {
  const parts = path.split('.');
  const key = parts.pop();
  const parent = parts.reduce((acc, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as any)[part];
    }
    return undefined;
  }, obj);

  if (parent && typeof parent === 'object' && key) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (parent as any)[key];
  }
  return { ...obj };
};

export const extractResponseError = ({
  name,
  errors,
}: {
  name: string;
  errors: NestedErrors | null;
}): string | undefined => {
  if (!name || !errors) return undefined;

  try {
    const parts = name.split('.');

    let current: any = errors;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }

      const index = parseInt(part);
      if (!isNaN(index)) {
        current = current[index];
      } else {
        current = current[part];
      }
    }

    return Array.isArray(current) ? current[0] : undefined;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error extracting error message for field: ${name}`, error);
    return undefined;
  }
};

export function invalidateOnSuccess<T>(tag: T) {
  return (
    _result: unknown,
    error: unknown,
  ): readonly { type: T; id?: string | number }[] => {
    return !error ? [{ type: tag }] as const : [];
  };
}

