import * as React from 'react';

/** Calls `fn` once input settles for `delay` ms. The latest `fn` is always used. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay = 300) {
  const fnRef = React.useRef(fn);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return React.useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}
