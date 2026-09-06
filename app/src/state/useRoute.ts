import { useEffect, useState } from 'octane';
import { parseRoute, routeToHash } from './route';
import type { Route } from './route';

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));

  // `hashchange` covers both back/forward and a link tapped from outside the app — which is
  // exactly how a marbot arrives, from their phone's camera.
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  return [
    route,
    (next: Route) => {
      location.hash = routeToHash(next);
      setRoute(next);
    },
  ];
}
