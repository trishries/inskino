export interface Screening {
  title: string;
  showtimes: string[]; // ISO 8601 datetimes with America/New_York offset
  ticketUrl: string;
}

export interface TheaterResult {
  name: string;
  url: string;
  status: 'ok' | 'empty' | 'error';
  films: Screening[];
  error?: string;
}

export interface ShowtimesOutput {
  lastUpdated: string;
  theaters: TheaterResult[];
}
