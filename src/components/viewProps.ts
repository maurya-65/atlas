import type { Atlas } from "./useAtlas";
import type { Route } from "./views";

/** What every page receives: the app (state, running jobs, actions) and where in the page the URL points. */
export interface ViewProps {
  atlas: Atlas;
  route: Route;
}
