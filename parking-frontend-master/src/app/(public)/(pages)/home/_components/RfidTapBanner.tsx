import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useEffect } from 'react';
import { formatDuration, formatTime } from '@/functions/dateFn';

export interface RfidTapResult {
  kind: 'entry' | 'exit' | 'error';
  uid: string;
  title: string;
  tenantName?: string;
  company?: string | null;
  licensePlate?: string;
  time?: string;
  durationMinutes?: number | null;
  charge?: number;
  sessionId?: string;
  message?: string;
}

const COLORS = {
  entry: { bg: '#2e7d32', label: 'ENTRY' },
  exit: { bg: '#ef6c00', label: 'EXIT' },
  error: { bg: '#c62828', label: 'DENIED' },
} as const;

// Exits stay up longer so the operator has time to spot a wrong exit and
// correct it.
const AUTO_HIDE_MS = { entry: 8000, exit: 20000, error: 10000 } as const;

interface Props {
  result: RfidTapResult;
  onDismiss: () => void;
  onMarkAsEntry: () => void;
  correcting: boolean;
}

const RfidTapBanner = ({ result, onDismiss, onMarkAsEntry, correcting }: Props) => {
  const { bg, label } = COLORS[result.kind];

  useEffect(() => {
    if (correcting) return undefined;
    const timer = setTimeout(onDismiss, AUTO_HIDE_MS[result.kind]);
    return () => clearTimeout(timer);
  }, [result, correcting, onDismiss]);

  return (
    <Box
      role="status"
      aria-live="assertive"
      sx={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(960px, calc(100vw - 32px))',
        zIndex: 1400,
        backgroundColor: bg,
        color: '#fff',
        borderRadius: 3,
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        padding: { xs: 2, md: 3 },
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        '@media print': { display: 'none' },
      }}
    >
      <Typography sx={{ fontSize: { xs: '32px', md: '56px' }, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>
        {label}
      </Typography>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: { xs: '22px', md: '32px' }, fontWeight: 700, lineHeight: 1.2 }} noWrap>
          {result.tenantName || result.title}
        </Typography>
        {(result.company || result.licensePlate) && (
          <Typography sx={{ fontSize: '18px', opacity: 0.9 }} noWrap>
            {[result.company, result.licensePlate].filter(Boolean).join(' · ')}
          </Typography>
        )}
        <Typography sx={{ fontSize: { xs: '18px', md: '22px' }, fontWeight: 600, marginTop: 0.5 }}>
          {result.kind === 'error'
            ? result.message
            : [
                result.time ? formatTime(result.time) : null,
                result.kind === 'exit' && result.durationMinutes != null
                  ? `Parked ${formatDuration(result.durationMinutes)}`
                  : null,
                result.kind === 'exit' && result.charge && result.charge > 0
                  ? `Charge due ₹${result.charge}`
                  : null,
              ]
                .filter(Boolean)
                .join('  ·  ')}
        </Typography>
      </Box>

      {result.kind === 'exit' && result.sessionId && (
        <Button
          variant="contained"
          onClick={onMarkAsEntry}
          disabled={correcting}
          sx={{
            backgroundColor: '#fff',
            color: '#bf360c',
            fontWeight: 700,
            fontSize: '16px',
            whiteSpace: 'nowrap',
            '&:hover': { backgroundColor: '#ffe0b2' },
          }}
        >
          {correcting ? 'Correcting…' : 'Wrong — mark as Entry'}
        </Button>
      )}

      <IconButton onClick={onDismiss} aria-label="Dismiss" sx={{ color: '#fff', alignSelf: 'flex-start' }}>
        <CloseIcon />
      </IconButton>
    </Box>
  );
};

export default RfidTapBanner;
