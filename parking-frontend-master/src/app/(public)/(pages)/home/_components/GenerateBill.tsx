'use client';

import { formatDate, formatTime } from '@/functions/dateFn';
import { Box, Typography } from '@mui/material';
import { useEffect } from 'react';
import styles from './styles.module.css';

interface IBillProp {
  ticketNo: string;
  entryTime: string;
  exitTime: string;
  amount: number;
  type: string;
  vehicleNo?: string;
  paymentMethod?: any;
  status?: string;
  stamps?: { vendor: string }[];
  onComplete?: () => void;
}
export default function GenerateBill({
  entryTime,
  exitTime,
  ticketNo,
  amount,
  type,
  vehicleNo,
  paymentMethod,
  status,
  stamps,
  onComplete,
}: Readonly<IBillProp>) {
  const inDate = formatDate(entryTime);
  const inTime = formatTime(entryTime);
  const outDate = formatDate(exitTime);
  const outTime = formatTime(exitTime);

  const formatPaymentMethod = (method?: string) => {
    if (!method) return 'Waived';
    return method === 'ONLINE_PAYMENT' ? 'Digital Payment' : method === 'CASH' ? 'Cash' : method;
  };

  // See ParkingSession.SESSION_STATUS_CHOICES on the backend — a free exit
  // isn't always a plain fee waiver. For a stamped exit, name the tenant(s)
  // who stamped it so the printed slip carries proof of who authorized it.
  const stampVendorNames = (stamps ?? []).map((s) => s.vendor).filter(Boolean).join(', ');
  const freeExitLabel =
    status === 'STAMPED'
      ? stampVendorNames
        ? `Stamped - ${stampVendorNames}`
        : 'Stamped'
      : status === 'COVERED_BY_PASS'
        ? 'Covered by Pass'
        : 'Waived';

  useEffect(() => {
    const printTimeout = setTimeout(() => {
      window.print();
    }, 500);

    const handleAfterPrint = () => {
      onComplete?.();
    };

    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      clearTimeout(printTimeout);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [onComplete]);

  return (
    <Box
      sx={{
        minWidth: '300px',
        marginTop: '4px',
      }}
      // Use same print root as ticket so our @media print CSS shows this bill
      className={`ticket-print-root ${styles.printable}`}
    >
      <Box className={styles.printable}>
        <Box
          sx={{
            textAlign: 'center',
            width: '100%',
            borderBottom: '2px solid #000',
            borderTop: '2px solid #000',
          }}
        >
          <Typography sx={{ letterSpacing: '2px' }} fontWeight="bold">
            PARKING RECEIPT
          </Typography>
        </Box>
        <Box sx={{ marginTop: '5px' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography>From: {inDate}</Typography>
            <Typography> {inTime}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography>To: {outDate}</Typography>
            <Typography>{outTime}</Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography>Type: {type === '4W' ? '4 wheeler' : '2 wheeler'}</Typography>
            <Typography>Vehicle No: {vehicleNo || ''}</Typography>
          </Box>
        </Box>
        <Box
          sx={{
            textAlign: 'center',
            width: '100%',
            marginTop: '10px',
          }}
        >
          <Typography>TICKET No. : {ticketNo}</Typography>
        </Box>
        <Box
          sx={{
            textAlign: 'center',
            borderBottom: '2px solid #000',
            borderTop: '2px solid #000',
            marginTop: '5px',
            padding: '5px 0',
          }}
        >
          <Typography fontWeight="bold" fontSize="14px">
            {amount > 0 ? (
              <>
                PAID: ₹{amount} ({formatPaymentMethod(paymentMethod)})
              </>
            ) : (
              <>FREE PARKING ({freeExitLabel})</>
            )}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

