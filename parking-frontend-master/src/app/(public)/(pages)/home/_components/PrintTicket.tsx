'use client';

import { formatDate, formatTime } from '@/functions/dateFn';
import { Box, Typography } from '@mui/material';
import { useState } from 'react';
import QRCodeGenerator from './QrCodeGen';
import styles from './styles.module.css';

// Match Next.js ticket visuals using public assets
const ARROW_UP_URL = '/images/website/arrowUp.png';
const BIKE_PARK_URL = '/images/website/BikePark.png';
const CAR_PARK_URL = '/images/website/carPark.png';
const PRINT_LOGO_URL = '/images/website/printLogo.png';

interface GenerateTicketProps {
  type: string;
  entryTime: string;
  ticketNo: string;
  vehicleNo?: string;
}

export interface ImageLoadState {
  [key: string]: boolean;
}

export default function GenerateTicket({
  type,
  entryTime,
  ticketNo,
  vehicleNo,
}: Readonly<GenerateTicketProps>) {
  // Align with Next.js version: wait for car/bike img (image1), logo (image2) and QR (image3)
  const [imagesLoaded, setImagesLoaded] = useState<ImageLoadState>({
    image1: false,
    image2: false,
    image3: false,
  });

  const date = formatDate(entryTime);
  const time = formatTime(entryTime);
  const displayVehicleNo = vehicleNo?.trim() || '-';

  const handleImageLoad = (imageName: string) => {
    setImagesLoaded((prev) => ({ ...prev, [imageName]: true }));
  };

  return (
    <Box
      sx={{
        minWidth: '300px',
        marginTop: '4px',
      }}
      className={`ticket-print-root ${styles.printable}`}
    >
      <Box className={styles.printable}>
        {/* Top black arrow bar */}
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <img
            src={ARROW_UP_URL}
            alt="arrow up"
            height={15}
            style={{ width: '100%', objectFit: 'cover' }}
          />
        </Box>

        {/* Left icon (car/bike) + QR on right + hidden logo like Next.js */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px',
          }}
        >
          <Box>
            <img
              src={type === 'Car' ? CAR_PARK_URL : BIKE_PARK_URL}
              alt={type === 'Car' ? 'Car parking' : 'Bike parking'}
              width={90}
              height={90}
              style={{ objectFit: 'contain' }}
              onLoad={() => handleImageLoad('image1')}
            />
          </Box>

          <QRCodeGenerator
            text={ticketNo}
            imagesLoaded={imagesLoaded}
            handleImageLoad={handleImageLoad}
            size={80}
          />

          {/* Hidden logo block (kept for visual parity if you ever show it) */}
          <Box sx={{ display: 'none', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <img
              src={PRINT_LOGO_URL}
              alt="Sallyan House"
              width={80}
              height={80}
              style={{ objectFit: 'contain' }}
              onLoad={() => handleImageLoad('image2')}
            />
            <Typography fontSize="10px">SALLYAN HOUSE</Typography>
          </Box>
        </Box>

        {/* Center bar with ticket number */}
        <Box
          sx={{
            textAlign: 'center',
            width: '100%',
            borderBottom: '2px solid #000',
            borderTop: '2px solid #000',
          }}
        >
          <Typography fontWeight="bold" fontSize="0.8rem" sx={{ letterSpacing: '2px' }}>
            PARKING TICKET : {ticketNo}
          </Typography>
        </Box>

        {/* Details row: From/Type/Vehicle vs Time on right */}
        <Box
          sx={{
            marginY: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '2px solid #000',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography>From: {date}</Typography>
            <Typography>Type: {type === 'Car' ? '4 wheeler' : '2 wheeler'}</Typography>
            <Typography>Vehicle No: {displayVehicleNo}</Typography>
          </Box>
          <Box>
            <Typography fontSize="30px" fontWeight="bold">
              {time}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Optional thank you text (kept hidden like original Next.js) */}
      <Box
        sx={{
          display: 'none',
          flexDirection: 'column',
          alignItems: 'center',
          marginY: '5px',
        }}
      >
        <Typography>Thank You. Sallyan House, Bagbazar</Typography>
      </Box>

      {/* Bottom black arrow bar */}
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <img
          src={ARROW_UP_URL}
          alt="arrow up"
          height={15}
          style={{ width: '100%', objectFit: 'cover' }}
        />
      </Box>

      {/* Note row */}
      <Box display="flex" justifyContent="center" sx={{ marginBottom: '5px' }}>
        <Typography sx={{ fontSize: '10px' }}>
          <strong>Note: </strong>
        </Typography>
        <Typography sx={{ fontSize: '10px' }}>
          In case of loss, there will be fine of Rs. 100
        </Typography>
      </Box>
    </Box>
  );
}

