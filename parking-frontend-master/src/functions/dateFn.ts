import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

export const formatDate = (inputDate: string, format: string = 'DD MMM, YYYY') => {
  const date = dayjs(inputDate);
  return date.format(format);
};

export const formatTime = (inputDate: string, format: string = 'hh:mm a') => {
  const date = dayjs(inputDate);
  return date.format(format);
};


// "2h 05m" / "45m" — for parked-time displays.
export const formatDuration = (minutes?: number | null) => {
  if (minutes === null || minutes === undefined) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};
