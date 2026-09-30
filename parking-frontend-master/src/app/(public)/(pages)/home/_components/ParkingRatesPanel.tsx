import { useEffect, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { useGetParkingRatesQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { formatClock, formatMoney, hasNightRate, isNightAt, rateSummary } from '@/components/settings/types';

// Re-check the clock this often so the card flips at night_start/night_end
// without a reload, and re-fetch rates now and then so Settings edits reach
// a POS that stays open all day.
const TICK_MS = 30_000;
const REFETCH_MS = 5 * 60_000;

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const rowSx = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1,
  fontSize: '0.8rem', color: '#666', marginBottom: 1,
};

export default function ParkingRatesPanel() {
  const { data: rates, isLoading, isError } = useGetParkingRatesQuery(undefined, {
    pollingInterval: REFETCH_MS,
  });
  const now = useNow();

  const title = (
    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: '#555' }}>
      Parking Rates
    </Typography>
  );

  if (!rates) {
    return (
      <Box sx={{ marginBottom: 3 }}>
        {title}
        <Typography variant="caption" sx={{ color: '#888' }}>
          {isLoading ? 'Loading rates…' : isError ? 'Rates unavailable.' : null}
        </Typography>
      </Box>
    );
  }

  const night = isNightAt(rates, now, rates.time_zone);
  const anyNightRate = rates.vehicle_types.some((vt) => vt.pricing_plan && hasNightRate(vt.pricing_plan));
  const showWindow = rates.night_pricing_enabled && anyNightRate;
  const currency = rates.currency_symbol;

  return (
    <Box sx={{ marginBottom: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        {title}
        {showWindow && (
          <Chip
            size="small"
            icon={night ? <DarkModeOutlinedIcon /> : <LightModeOutlinedIcon />}
            label={night ? 'Night rate' : 'Day rate'}
            sx={{
              fontSize: '0.65rem', fontWeight: 'bold', marginBottom: '0.35em',
              backgroundColor: night ? '#283593' : '#fff3e0',
              color: night ? '#fff' : '#e65100',
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
        )}
      </Box>

      {rates.vehicle_types.map((vt) => {
        const plan = vt.pricing_plan;
        const nightRate = plan && hasNightRate(plan) && rates.night_pricing_enabled;
        const current = !plan
          ? 'No plan'
          : night && nightRate
            ? `${formatMoney(plan.night_rate_per_hour, currency)} / hour`
            : rateSummary(plan, currency);
        return (
          <Box key={vt.id} sx={{ marginBottom: 1 }}>
            <Box sx={{ ...rowSx, marginBottom: 0 }}>
              <span>{vt.name}:</span>
              <span style={{ fontWeight: 600, color: '#333' }}>{current}</span>
            </Box>
            {plan && nightRate && (
              <Typography variant="caption" component="div" sx={{ color: '#999', textAlign: 'right' }}>
                {night
                  ? `Day ${rateSummary(plan, currency)} from ${formatClock(rates.night_end)}`
                  : `Night ${formatMoney(plan.night_rate_per_hour, currency)} / hour from ${formatClock(rates.night_start)}`}
              </Typography>
            )}
          </Box>
        );
      })}

      {showWindow && (
        <Typography variant="caption" component="p" sx={{ color: '#888', marginTop: 1 }}>
          {night
            ? `Night rate until ${formatClock(rates.night_end)}.`
            : `Night rate ${formatClock(rates.night_start)}–${formatClock(rates.night_end)}.`}
          {(rates.night_morning_grace_minutes > 0 || rates.night_evening_grace_minutes > 0) &&
            ` Registered vehicles: first ${rates.night_morning_grace_minutes} min before ${formatClock(rates.night_end)} and last ${rates.night_evening_grace_minutes} min after ${formatClock(rates.night_start)} are free.`}
        </Typography>
      )}
    </Box>
  );
}
