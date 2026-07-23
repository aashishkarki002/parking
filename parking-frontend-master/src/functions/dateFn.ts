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

