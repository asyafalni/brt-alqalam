import { useEffect, useState } from 'octane';
import { parseRoute, routeToPath } from './route';
import type { Route } from './route';

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname, location.search));

  // Back/forward must work: a marbot who scans a label and taps back should land where they
  // came from, not on a dead screen.
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(location.pathname, location.search));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  return [
    route,
    (next: Route) => {
      history.pushState(null, '', routeToPath(next));
      setRoute(next);
    },
  ];
}
