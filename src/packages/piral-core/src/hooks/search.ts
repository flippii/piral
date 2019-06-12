import { useEffect, useRef, useState } from 'react';
import { wrapElement } from 'react-arbiter';
import { useDebounce } from './debounce';
import { useGlobalState } from './globalState';
import { useActions } from './actions';
import { Disposable, SearchOptions } from '../types';

/**
 * Hook that yields the possibility of searching in Piral.
 * Returns the current (live, i.e., non-debounced) input value
 * and the ability to change the input value.
 * Changing the input value uses a debounce function to
 * properly cancel any current search and start a new search.
 * All registered search providers are used and search results
 * will be integrated as they arrive.
 */
export function useSearch(): [string, (value: string) => void, () => void] {
  const { setSearchInput, resetSearchResults, appendSearchResults } = useActions();
  const [immediate, setImmediate] = useState(false);
  const searchInput = useGlobalState(m => m.search.input);
  const providers = useGlobalState(m => m.components.searchProviders);
  const q = useDebounce(searchInput);
  const cancel = useRef<Disposable>(undefined);
  const triggerSearch = () => setImmediate(true);
  const query = immediate ? searchInput : q;

  useEffect(() => {
    const providerKeys = Object.keys(providers);
    const load = !!q && providerKeys.length > 0;
    const enter = immediate;
    cancel.current && cancel.current();
    resetSearchResults(load);

    if (enter) {
      setImmediate(false);
    }

    if (load) {
      let searchCount = providerKeys.length;
      let active = true;
      cancel.current = () => (active = false);
      const opts: SearchOptions = {
        query,
        immediate: enter,
      };
      providerKeys.forEach(key =>
        providers[key].search(opts).then(
          results => {
            active && appendSearchResults(results.map(m => wrapElement(m)), --searchCount === 0);
          },
          ex => {
            console.warn(ex);
            active && --searchCount === 0 && appendSearchResults([], true);
          },
        ),
      );
    }
  }, [query]);

  return [searchInput, setSearchInput, triggerSearch];
}
