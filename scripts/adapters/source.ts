// A data source the scraper can swap: ISU's site today; an official feed or manual JSON later.
import type { Hours, Location, MenuItem } from '../../src/data/types';
import type { ListedVenue, VenueDetails } from './isu';

export interface Source {
  name: string;
  listVenues(): Promise<ListedVenue[]>;
  venueDetails(slug: string): Promise<VenueDetails>;
  hours(locs: Location[], start: string, days: number): Promise<Hours>;
  menu(loc: Location, date: string): Promise<MenuItem[]>;
}
