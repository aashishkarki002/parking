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
  onComplete,
}: Readonly<IBillProp>) {
  const imagesLoaded = {
    image1: true,
    image2: true,
  };
  const inDate = formatDate(entryTime);
  const inTime = formatTime(entryTime);
  const outDate = formatDate(exitTime);
  const outTime = formatTime(exitTime);

  const formatPaymentMethod = (method?: string) => {
    if (!method) return 'Waived';
    return method === 'ONLINE_PAYMENT' ? 'Digital Payment' : method === 'CASH' ? 'Cash' : method;
  };

  useEffect(() => {
    const handlePrint = () => {
      if (Object.values(imagesLoaded).every(Boolean)) {
        const printTimeout = setTimeout(() => {
          window.print();
        }, 500);

        return () => clearTimeout(printTimeout);
      }
      return undefined;
    };

    handlePrint();

    const handleAfterPrint = () => {
      onComplete?.();
    };

    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [imagesLoaded, onComplete]);

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
              <>FREE PARKING (Waived)</>
            )}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

