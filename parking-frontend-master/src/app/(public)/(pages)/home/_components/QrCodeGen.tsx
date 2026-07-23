'use client';

import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';
import type { ImageLoadState } from './PrintTicket';

interface QRCodeGeneratorProps {
  text: string;
  size?: number;
  handleImageLoad: (imageName: string) => void;
  imagesLoaded: ImageLoadState;
}

const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({
  text,
  size = 128,
  handleImageLoad,
  imagesLoaded,
}) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    const generateQR = async () => {
      try {
        const url = await QRCode.toDataURL(text, {
          width: size,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(url);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error generating QR code:', err);
      }
    };

    generateQR();
  }, [text, size]);

  useEffect(() => {
    if (Object.values(imagesLoaded).every(Boolean)) {
      window.print();
    }
  }, [imagesLoaded]);

  if (!qrCodeUrl) {
    return <div>Loading QR Code...</div>;
  }

  return (
    <img
      src={qrCodeUrl}
      alt={`QR Code for ${text}`}
      width={size}
      height={size}
      onLoad={() => {
        handleImageLoad('image3');
      }}
    />
  );
};

export default QRCodeGenerator;

