'use client';

import AppButton from '@/components/cComponents/form/appButton/AppButton';
import DriveEtaIcon from '@mui/icons-material/DriveEta';
import LocalParkingIcon from '@mui/icons-material/LocalParking';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import TwoWheelerIcon from '@mui/icons-material/TwoWheeler';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import { GridCheckCircleIcon } from '@mui/x-data-grid';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  useApplyCouponMutation,
  useLazySearchStaffQuery,
  usePaymentMethodMutation,
  usePrintBillMutation,
  useScanCodeMutation,
  useTenantCardConfirmMutation,
  useTenantCardScanMutation,
} from '@/app/(public)/(pages)/home/_redux/api';
import GenerateBill from './GenerateBill';
import GenerateTicket from './PrintTicket';
import styles from './styles.module.css';

// Tenant cards encode a UUID card_code (physical), "<uuid>:<ts>:<sig>"
// (online digital — Django TimestampSigner), or "<uuid>#<6-digit-code>"
// (offline digital — see Staff.resolve_scanned_code on the backend).
// Printed tickets encode a "TI<date>-<seq>" ticket_number. The two hidden
// scan inputs look identical to an operator, so a card scanned into the
// wrong field (or vice versa) otherwise fires a doomed request and surfaces
// only a generic "Resource not found" toast. Catch the format mismatch
// before the request goes out.
const TENANT_CARD_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[^:]+:[^:]+|#\d{6})?$/i;

const Options = () => {
  const [bikeData, setBikeData] = useState<{
    entryTime: string;
    ticketNo: string;
    vehicleNo?: string;
  } | null>(null);
  const [carData, setCarData] = useState<{
    entryTime: string;
    ticketNo: string;
    vehicleNo?: string;
  } | null>(null);
  const [billData, setBillData] = useState<{
    id: number;
    ticketNo: string;
    vehicleNo: string;
    name: string;
    phone: string;
    type: string;
    charge: number;
    createdAt: string;
    endAt: string;
    isActive: boolean;
    paymentMethod?: string;
  } | null>(null);
  const [parkingPassData, setParkingPassData] = useState<{
    action: string;
    ticketNo: string;
    entryTime: string;
    exitTime: string;
    message: string;
  } | null>(null);
  // Preview returned by tenant-card/scan (step 1). Nothing is written to the
  // backend until the operator visually matches the plate to the car and
  // clicks Confirm — this is what closes the "anyone can drive in on a
  // tenant's free pass" gap.
  const [pendingCardScan, setPendingCardScan] = useState<{
    cardCode: string;
    action: 'entry' | 'exit';
    staffName: string;
    company: string | null;
    licensePlate: string;
    vehicleType: string | null;
  } | null>(null);
  const [confirmingCardScan, setConfirmingCardScan] = useState(false);

  // Manual fallback for offline mode: the tenant's phone shows a rotating
  // 6-digit code with no network needed to generate it (see Staff.verify_offline_code
  // on the backend), but there's no realistic way for an operator to scan/type a
  // full "uuid#code" string. Instead: look the tenant up by name/plate, then just
  // type the code they read aloud.
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false);
  const [offlineSearchQuery, setOfflineSearchQuery] = useState('');
  const [offlineSelectedStaff, setOfflineSelectedStaff] = useState<{
    id: number;
    name: string;
    company: string | null;
    license_plate: string;
    vehicle_type: string | null;
    card_code: string;
  } | null>(null);
  const [offlineCode, setOfflineCode] = useState('');
  const [offlineSubmitting, setOfflineSubmitting] = useState(false);
  const [triggerSearchStaff, searchStaffResult] = useLazySearchStaffQuery();

  const [ticketNo, setTicketNo] = useState('');
  const [scanning, setScanning] = useState(false);
  const [openPopup, setOpenPopup] = useState(false);
  const [vehicleNo, setVehicleNo] = useState('');
  const [proceedToGenerateBill, setProceedToGenerateBill] = useState(false);
  const [billGenerated, setBillGenerated] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const couponScanInputRef = useRef<HTMLInputElement>(null);
  const parkingPassInputRef = useRef<HTMLInputElement>(null);
  const [currentVehicleType, setCurrentVehicleType] = useState<'2W' | '4W' | null>(null);

  const [scanQr] = useScanCodeMutation();
  const [printBill] = usePrintBillMutation();
  const [postPayment] = usePaymentMethodMutation();
  const [postCoupon] = useApplyCouponMutation();
  const [scanTenantCard] = useTenantCardScanMutation();
  const [confirmTenantCard] = useTenantCardConfirmMutation();

  // Hardware barcode scanners type the whole code in one fast burst, but the
  // scanner's terminating Enter/CR suffix does not always reach the browser
  // as an Enter keydown (e.g. Honeywell scanners sending CR via ALT-codes).
  // So each hidden scan input also submits after a short idle pause instead
  // of relying on Enter alone.
  const SCAN_IDLE_MS = 300;
  const scanIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanSubmitting = useRef(false);

  const queueScanSubmit = (submit: () => void) => {
    if (scanIdleTimer.current) clearTimeout(scanIdleTimer.current);
    scanIdleTimer.current = setTimeout(submit, SCAN_IDLE_MS);
  };

  const beginScanSubmit = (value: string) => {
    if (scanSubmitting.current || !value) return false;
    if (scanIdleTimer.current) clearTimeout(scanIdleTimer.current);
    scanSubmitting.current = true;
    return true;
  };

  const submitParkingPassScan = async () => {
    const scannedValue = parkingPassInputRef.current?.value?.trim() ?? '';
    if (!beginScanSubmit(scannedValue)) return;

    if (!TENANT_CARD_PATTERN.test(scannedValue)) {
      toast.error('That looks like a ticket, not a tenant card. Use the ticket scanner instead.');
      scanSubmitting.current = false;
      if (parkingPassInputRef.current) parkingPassInputRef.current.value = '';
      parkingPassInputRef?.current?.blur();
      return;
    }

    setParkingPassData(null);
    setPendingCardScan(null);
    setScanning(true);

    try {
      const res = await scanTenantCard({
        card_code: scannedValue,
      }).unwrap();
      if (res) {
        setPendingCardScan({
          cardCode: scannedValue,
          action: res.action,
          staffName: res.staff?.name ?? '',
          company: res.staff?.company ?? null,
          licensePlate: res.staff?.license_plate ?? '',
          vehicleType: res.staff?.vehicle_type ?? null,
        });
      } else {
        // eslint-disable-next-line no-console
        console.warn('Tenant card scan succeeded but returned no data.');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error scanning tenant card:', err);
      toast.error(
        (err as { data?: { error?: string } })?.data?.error || 'Could not read this card. Try again.'
      );
    } finally {
      scanSubmitting.current = false;
      setScanning(false);
      if (parkingPassInputRef.current) parkingPassInputRef.current.value = '';
      parkingPassInputRef?.current?.blur();
    }
  };

  const handleConfirmCardScan = async () => {
    if (!pendingCardScan) return;
    setConfirmingCardScan(true);

    try {
      const res = await confirmTenantCard({
        card_code: pendingCardScan.cardCode,
      }).unwrap();
      if (res?.session) {
        setParkingPassData({
          action: res.action,
          ticketNo: res.session.ticket_number,
          entryTime: res.session.entry_time,
          exitTime: res.session.exit_time,
          message:
            res.action === 'exit'
              ? `Exit recorded. Charge: ${res.session.calculated_charge ?? '0.00'}`
              : 'Entry recorded',
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error confirming tenant card scan:', err);
      toast.error(
        (err as { data?: { error?: string } })?.data?.error || 'Could not confirm this card. Try again.'
      );
    } finally {
      setConfirmingCardScan(false);
      setPendingCardScan(null);
    }
  };

  const handleCancelCardScan = () => {
    setPendingCardScan(null);
  };

  const handleOpenOfflineDialog = () => {
    resetTicketData();
    setOfflineDialogOpen(true);
    setOfflineSearchQuery('');
    setOfflineSelectedStaff(null);
    setOfflineCode('');
  };

  const handleCloseOfflineDialog = () => {
    setOfflineDialogOpen(false);
    setOfflineSearchQuery('');
    setOfflineSelectedStaff(null);
    setOfflineCode('');
  };

  // Debounce the lookup so every keystroke doesn't fire a request.
  useEffect(() => {
    if (offlineSelectedStaff) return;
    const trimmed = offlineSearchQuery.trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      triggerSearchStaff(trimmed);
    }, 300);
    return () => clearTimeout(timer);
  }, [offlineSearchQuery, offlineSelectedStaff, triggerSearchStaff]);

  const submitOfflineCode = async () => {
    if (!offlineSelectedStaff || offlineCode.trim().length !== 6) return;
    setOfflineSubmitting(true);

    try {
      const res = await scanTenantCard({
        card_code: `${offlineSelectedStaff.card_code}#${offlineCode.trim()}`,
      }).unwrap();
      if (res) {
        setPendingCardScan({
          cardCode: `${offlineSelectedStaff.card_code}#${offlineCode.trim()}`,
          action: res.action,
          staffName: res.staff?.name ?? offlineSelectedStaff.name,
          company: res.staff?.company ?? offlineSelectedStaff.company,
          licensePlate: res.staff?.license_plate ?? offlineSelectedStaff.license_plate,
          vehicleType: res.staff?.vehicle_type ?? offlineSelectedStaff.vehicle_type,
        });
        handleCloseOfflineDialog();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error submitting offline code:', err);
      toast.error(
        (err as { data?: { error?: string } })?.data?.error ||
          'Could not verify this code. Confirm it with the tenant and try again.'
      );
    } finally {
      setOfflineSubmitting(false);
    }
  };

  const submitBillScan = async () => {
    const scannedTicket = inputRef.current?.value?.trim() ?? '';
    if (!beginScanSubmit(scannedTicket)) return;

    if (TENANT_CARD_PATTERN.test(scannedTicket)) {
      toast.error('That looks like a tenant card, not a ticket. Use the Parking Pass button instead.');
      scanSubmitting.current = false;
      inputRef?.current?.blur();
      return;
    }

    setScanning(true);
    setBillData(null);

    try {
      const res = await printBill({
        ticketNo: scannedTicket,
        vehicleNo: bikeData?.vehicleNo || carData?.vehicleNo,
      }).unwrap();

      if (res) {
        const respData = {
          id: res.id,
          ticketNo: res.ticket_number,
          vehicleNo: res.license_plate || bikeData?.vehicleNo || carData?.vehicleNo || '',
          name: res.name || '',
          phone: res.phone || '',
          type: res.vehicle_type === '2Wheeler' ? '2W' : '4W',
          // backend returns strings like "60.00" – coerce to number
          charge: Number(res.calculated_charge ?? 0),
          createdAt: res.entry_time,
          endAt: res.exit_time,
          isActive: res.is_active,
          paymentMethod: res.payment_method,
        };
        setBillData(respData);
        setBikeData(null);
        setCarData(null);
      } else {
        // eslint-disable-next-line no-console
        console.warn('Print Bill API call for bill succeeded but returned no data.');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('err in api call for bill', err);
    } finally {
      scanSubmitting.current = false;
    }
    inputRef?.current?.blur();
  };

  const submitCouponScan = () => {
    const scannedValue = couponScanInputRef.current?.value?.trim() ?? '';
    if (!beginScanSubmit(scannedValue)) return;
    setCouponCode(scannedValue);
    setScanning(false);
    if (couponScanInputRef.current) couponScanInputRef.current.value = '';
    couponScanInputRef?.current?.blur();
    scanSubmitting.current = false;
  };

  const resetTicketData = () => {
    setBikeData(null);
    setCarData(null);
    if (!processingPayment && !proceedToGenerateBill) {
      setBillData(null);
    }
    setParkingPassData(null);
    setPendingCardScan(null);
    setCouponCode('');
    if (!processingPayment) {
      setProceedToGenerateBill(false);
      setBillGenerated(false);
    }
    setProcessingPayment(false);
    setApplyingCoupon(false);
  };

  const handleBikeClick = () => {
    resetTicketData();
    setVehicleNo('');
    setCurrentVehicleType('2W');
    setOpenPopup(true);
  };

  const handleCarClick = () => {
    resetTicketData();
    setVehicleNo('');
    setCurrentVehicleType('4W');
    setOpenPopup(true);
  };

  const handleParkingPassClick = () => {
    resetTicketData();

    if (parkingPassInputRef.current) {
      parkingPassInputRef.current.value = '';
    }

    setTimeout(() => {
      if (parkingPassInputRef.current) {
        parkingPassInputRef.current.focus();
        setScanning(true);
      }
    }, 50);
  };

  const handleBillClick = () => {
    if (!proceedToGenerateBill && !billGenerated) {
      resetTicketData();
    }

    if (inputRef.current) {
      inputRef.current.focus();
      setTicketNo('');
      setScanning(true);
    }
  };

  const handleDialogDismiss = () => {
    setOpenPopup(false);
    setCurrentVehicleType(null);
    setVehicleNo('');
  };

  const proceedToGenerateTicket = async (vehicleNumberInput?: string) => {
    if (!currentVehicleType) return;

    const vehicleToRegister = vehicleNumberInput?.trim() ? vehicleNumberInput.trim() : undefined;

    setOpenPopup(false);
    setScanning(true);

    try {
      const res = await scanQr({
        vehicle_type_id: currentVehicleType == '2W' ? 1 : 2,
        license_plate: vehicleToRegister,
      }).unwrap();
      if (res) {
        const ticketPayload = {
          entryTime: res.entryTime,
          ticketNo: res.ticket_number,
          vehicleNo: vehicleToRegister,
        };

        if (currentVehicleType === '2W') {
          setBikeData(ticketPayload);
          setCarData(null);
        } else if (currentVehicleType === '4W') {
          setCarData(ticketPayload);
          setBikeData(null);
        }

        setBillData(null);
      } else {
        // eslint-disable-next-line no-console
        console.warn('Scan QR API call for ticket succeeded but returned no data.');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error generating ticket:', e);
    } finally {
      setScanning(false);
      setCurrentVehicleType(null);
      setVehicleNo('');
    }
  };

  const handleConfirmVehicleEntry = () => {
    proceedToGenerateTicket(vehicleNo);
  };

  const handlePaymentMethod = async (paymentMethod: 'CASH' | 'ONLINE_PAYMENT') => {
    setProcessingPayment(true);
    try {
      if (!billData?.ticketNo) return;

      const res = await postPayment({
        ticketNo: billData.ticketNo,
        payment_method: paymentMethod,
      }).unwrap();

      if (res) {
        const updatedBillData = {
          ...billData,
          charge: res.data?.calculated_charge || billData.charge,
          endAt: res.data?.exit_time || billData.endAt,
          paymentMethod,
        };

        setBillData(updatedBillData);
        setProceedToGenerateBill(true);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Payment error:', err);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleApplyCoupon = async () => {
    console.log('handleApplyCoupon', billData?.ticketNo, couponCode.trim());
    if (!billData?.ticketNo || !couponCode.trim()) return;

    setApplyingCoupon(true);
    try {
      const res = await postCoupon({
        ticketNo: billData.ticketNo,
        coupon_code: couponCode.trim(),
      }).unwrap();

      if (res) {
        setBillData({
          ...billData,
          charge: res.calculated_charge,
        });
        setCouponCode('');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error applying coupon:', err);
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleNewTransaction = () => {
    setBikeData(null);
    setCarData(null);
    setBillData(null);
    setParkingPassData(null);
    setPendingCardScan(null);
    setCouponCode('');
    setProceedToGenerateBill(false);
    setBillGenerated(false);
    setProcessingPayment(false);
    setApplyingCoupon(false);
    setTicketNo('');
    setCurrentVehicleType(null);
    setVehicleNo('');
  };

  const handleCouponScanClick = () => {
    setCouponCode('');

    setTimeout(() => {
      if (couponScanInputRef.current) {
        couponScanInputRef.current.focus();
        setScanning(true);
      }
    }, 50);
  };

  return (
    <>
      <input
        ref={parkingPassInputRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
        aria-hidden="true"
        type="text"
        onBlur={() => setScanning(false)}
        onFocus={() => {
          setParkingPassData(null);
          setPendingCardScan(null);
        }}
        onKeyDown={(e) => {
          if (e?.key === 'Enter') {
            submitParkingPassScan();
          } else {
            queueScanSubmit(submitParkingPassScan);
          }
        }}
      />
      <input
        ref={inputRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
        aria-hidden="true"
        value={ticketNo}
        type="text"
        onChange={(e) => {
          setTicketNo(e?.target?.value);
        }}
        onBlur={() => setScanning(false)}
        onFocus={() => {
          setTicketNo('');
          setBillData(null);
        }}
        onKeyDown={(e) => {
          if (e?.key === 'Enter') {
            submitBillScan();
          } else {
            queueScanSubmit(submitBillScan);
          }
        }}
      />
      <input
        ref={couponScanInputRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
        aria-hidden="true"
        type="text"
        onBlur={() => setScanning(false)}
        onKeyDown={(e) => {
          if (e?.key === 'Enter') {
            submitCouponScan();
          } else {
            queueScanSubmit(submitCouponScan);
          }
        }}
      />
      <Box sx={{ display: 'flex', width: '100%', gap: 2, padding: 2 }}>
        <Box sx={{ width: { xs: '100%', md: '75%' } }}>
          <Grid
            container
            sx={{
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
            }}
            spacing={2}
            className={styles.nonPrintable}
          >
            {scanning && (
              <Box
                sx={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: '999999',
                  padding: '20px',
                  background: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(5px)',
                  borderRadius: '12px',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
                  color: '#333',
                  textAlign: 'center',
                  minWidth: '300px',
                }}
              >
                <Typography fontSize="32px" fontWeight="bold">
                  Scanning Code
                  <span className={styles.dot}>.</span>
                  <span className={styles.dot}>.</span>
                  <span className={styles.dot}>.</span>
                </Typography>
              </Box>
            )}
            <Grid item xs={6}>
              <AppButton
                loading={false}
                extendStyle
                sx={{
                  fontSize: '80px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#a59b8a',
                  '&:hover': {
                    backgroundColor: '#5b554e',
                    color: '#fff',
                    transform: 'translateY(-3px)',
                  },
                  '&:active': {
                    transform: 'translateY(-1px)',
                  },
                }}
                onClick={handleCarClick}
              >
                <DriveEtaIcon sx={{ fontSize: '180px' }} />
              </AppButton>
            </Grid>
            <Grid item xs={6}>
              <AppButton
                loading={false}
                extendStyle
                sx={{
                  fontSize: '20px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#a59b8a',
                  '&:hover': {
                    backgroundColor: '#5b554e',
                    color: '#fff',
                    transform: 'translateY(-3px)',
                  },
                  '&:active': {
                    transform: 'translateY(-1px)',
                  },
                }}
                onClick={handleParkingPassClick}
              >
                <LocalParkingIcon sx={{ fontSize: '180px' }} />
              </AppButton>
            </Grid>

            <Grid item xs={6}>
              <AppButton
                loading={false}
                extendStyle
                sx={{
                  fontSize: '20px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#a59b8a',
                  '&:hover': {
                    backgroundColor: '#5b554e',
                    color: '#fff',
                    transform: 'translateY(-3px)',
                  },
                  '&:active': {
                    transform: 'translateY(-1px)',
                  },
                }}
                onClick={handleBikeClick}
              >
                <TwoWheelerIcon sx={{ fontSize: '180px' }} />
              </AppButton>
            </Grid>

            <Grid item xs={6}>
              <AppButton
                loading={false}
                extendStyle
                sx={{
                  fontSize: '20px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#a59b8a',
                  '&:hover': {
                    backgroundColor: '#5b554e',
                    color: '#fff',
                    transform: 'translateY(-3px)',
                  },
                  '&:active': {
                    transform: 'translateY(-1px)',
                  },
                }}
                onClick={handleBillClick}
              >
                <QrCodeScannerIcon sx={{ fontSize: '180px' }} />
              </AppButton>
            </Grid>
          </Grid>

          <Box sx={{ textAlign: 'center', marginTop: 2 }} className={styles.nonPrintable}>
            <Button
              startIcon={<WifiOffIcon />}
              size="small"
              onClick={handleOpenOfflineDialog}
              sx={{ color: '#5b554e', textTransform: 'none' }}
            >
              Tenant has no signal? Enter offline code manually
            </Button>
          </Box>
        </Box>

        <Box
          sx={{
            width: { xs: 0, md: '25%' },
            padding: 2,
            display: { xs: 'none', md: 'block' },
            '@media print': {
              display: 'none !important',
            },
          }}
          className={styles.nonPrintable}
        >
          <Paper
            elevation={3}
            sx={{ padding: 3, height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            <Box sx={{ marginBottom: 3 }}>
              <Typography
                variant="subtitle1"
                gutterBottom
                sx={{ fontWeight: 'bold', color: '#555' }}
              >
                Parking Rates
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: '#666',
                  marginBottom: 1,
                }}
              >
                <span>Two-Wheelers:</span>
                <span>₹30/hour</span>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: '#666',
                }}
              >
                <span>Four-Wheelers:</span>
                <span>₹60/hour</span>
              </Box>
            </Box>

            {pendingCardScan && (
              <Box sx={{ flexGrow: 1 }}>
                <Box
                  sx={{
                    marginBottom: 3,
                    padding: 2,
                    backgroundColor: '#fff8e1',
                    borderRadius: 2,
                    border: '2px solid #ffb300',
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    gutterBottom
                    sx={{
                      fontWeight: 'bold',
                      color: '#e65100',
                      borderBottom: '1px solid #ffe0b2',
                      paddingBottom: 1,
                      marginBottom: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <LocalParkingIcon fontSize="small" />
                    Verify Plate Before Confirming
                  </Typography>

                  <Box sx={{ marginBottom: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#555' }}>
                      Tenant:
                    </Typography>{' '}
                    <Typography variant="caption">
                      {pendingCardScan.staffName}
                      {pendingCardScan.company ? ` (${pendingCardScan.company})` : ''}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      textAlign: 'center',
                      padding: '10px',
                      backgroundColor: '#fff',
                      border: '2px dashed #e65100',
                      borderRadius: 1,
                      marginBottom: 1.5,
                    }}
                  >
                    <Typography variant="h5" sx={{ fontWeight: 'bold', letterSpacing: 1 }}>
                      {pendingCardScan.licensePlate || 'NO PLATE ON FILE'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#777' }}>
                      Match this plate to the car before confirming
                    </Typography>
                  </Box>

                  <Chip
                    label={
                      pendingCardScan.action === 'exit' ? 'WILL RECORD EXIT' : 'WILL RECORD ENTRY'
                    }
                    size="small"
                    sx={{
                      backgroundColor: pendingCardScan.action === 'exit' ? '#f44336' : '#4caf50',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '0.65rem',
                      marginBottom: 2,
                    }}
                  />

                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleConfirmCardScan}
                      disabled={confirmingCardScan}
                      sx={{ flex: 1, fontSize: '0.75rem', fontWeight: 'bold' }}
                    >
                      {confirmingCardScan
                        ? 'Confirming...'
                        : `Confirm ${pendingCardScan.action === 'exit' ? 'Exit' : 'Entry'}`}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={handleCancelCardScan}
                      disabled={confirmingCardScan}
                      sx={{ flex: 1, fontSize: '0.75rem' }}
                    >
                      Plate Mismatch / Cancel
                    </Button>
                  </Box>
                </Box>
              </Box>
            )}

            {!pendingCardScan && (parkingPassData || billData) && (
              <Box sx={{ flexGrow: 1 }}>
                {parkingPassData && (
                  <Box
                    sx={{
                      marginBottom: 3,
                      padding: 2,
                      backgroundColor: '#f5f5f5',
                      borderRadius: 2,
                      border: '1px solid #e0e0e0',
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      gutterBottom
                      sx={{
                        fontWeight: 'bold',
                        color: '#1976d2',
                        borderBottom: '1px solid #e0e0e0',
                        paddingBottom: 1,
                        marginBottom: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <LocalParkingIcon fontSize="small" />
                      Parking Pass
                    </Typography>

                    <Grid container spacing={1}>
                      <Grid item xs={12}>
                        <Box
                          sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#555' }}>
                            Ticket No:
                          </Typography>
                          <Typography variant="caption">{parkingPassData.ticketNo}</Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={12}>
                        <Box
                          sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#555' }}>
                            Entry Time:
                          </Typography>
                          <Typography variant="caption">
                            {new Date(parkingPassData.entryTime).toLocaleTimeString()}
                          </Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={12}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#555' }}>
                            Status:
                          </Typography>
                          <Chip
                            label={parkingPassData.action.toUpperCase()}
                            size="small"
                            sx={{
                              backgroundColor:
                                parkingPassData.action === 'ENTRY'
                                  ? '#4caf50'
                                  : parkingPassData.action === 'EXIT'
                                    ? '#f44336'
                                    : '#ff9800',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '0.6rem',
                              height: '20px',
                            }}
                          />
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>
                )}

                {billData && !billGenerated && (
                  <Box
                    sx={{
                      padding: 2,
                      backgroundColor: '#f8f9fa',
                      borderRadius: 2,
                      border: '1px solid #e0e0e0',
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      gutterBottom
                      sx={{
                        fontWeight: 'bold',
                        color: '#333',
                        borderBottom: '1px solid #e0e0e0',
                        paddingBottom: 1,
                        marginBottom: 1.5,
                      }}
                    >
                      Current Transaction
                    </Typography>

                    <Box sx={{ marginBottom: 2 }}>
                      <Box
                        sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#555' }}>
                          Ticket No:
                        </Typography>
                        <Typography variant="caption">{billData.ticketNo}</Typography>
                      </Box>

                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: '#fff8e1',
                          padding: '8px 12px',
                          borderRadius: 1,
                          border: '1px solid #ffecb3',
                          marginBottom: 1.5,
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#555' }}>
                          CHARGE AMOUNT:
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#d32f2f' }}>
                          ₹{billData.charge}
                        </Typography>
                      </Box>

                      <Box sx={{ marginBottom: 2 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 'bold',
                            color: '#555',
                            display: 'block',
                            marginBottom: 1,
                          }}
                        >
                          Apply Coupon:
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField
                            label="Coupon Code"
                            variant="outlined"
                            size="small"
                            fullWidth
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                            disabled={applyingCoupon}
                            sx={{
                              '& .MuiInputBase-root': {
                                height: '36px',
                                fontSize: '0.8rem',
                              },
                            }}
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <IconButton
                                    onClick={handleCouponScanClick}
                                    edge="end"
                                    size="small"
                                    sx={{ mr: -1 }}
                                  >
                                    <QrCodeScannerIcon fontSize="small" />
                                  </IconButton>
                                </InputAdornment>
                              ),
                            }}
                          />
                          <Button
                            variant="outlined"
                            onClick={handleApplyCoupon}
                            disabled={applyingCoupon || !couponCode.trim()}
                            size="small"
                            sx={{
                              minWidth: '80px',
                              fontSize: '0.75rem',
                            }}
                          >
                            {applyingCoupon ? 'Applying...' : 'Apply'}
                          </Button>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', gap: 1.5 }}>
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={() => handlePaymentMethod('CASH')}
                          disabled={processingPayment}
                          sx={{
                            flex: 1,
                            fontSize: '0.75rem',
                            py: 1,
                            fontWeight: 'bold',
                          }}
                        >
                          {processingPayment ? 'Processing...' : 'Cash Payment'}
                        </Button>
                        <Button
                          variant="contained"
                          color="success"
                          onClick={() => handlePaymentMethod('ONLINE_PAYMENT')}
                          disabled={processingPayment}
                          sx={{
                            flex: 1,
                            fontSize: '0.75rem',
                            py: 1,
                            fontWeight: 'bold',
                          }}
                        >
                          {processingPayment ? 'Processing...' : 'Online Pay'}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                )}

                {billGenerated && billData && (
                  <Box
                    sx={{
                      padding: 2,
                      backgroundColor: '#e8f5e9',
                      borderRadius: 2,
                      border: '1px solid #c8e6c9',
                      textAlign: 'center',
                    }}
                  >
                    <GridCheckCircleIcon sx={{ color: '#4caf50', fontSize: '2.5rem', mb: 1 }} />
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 'bold', color: '#2e7d32', mb: 1 }}
                    >
                      Payment Complete!
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                      Ticket: <strong>{billData.ticketNo}</strong>
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
                      Amount Paid: <strong>₹{billData.charge}</strong>
                    </Typography>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleNewTransaction}
                      sx={{
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                      }}
                    >
                      New Transaction
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {!parkingPassData && !billData && !pendingCardScan && (
              <Box
                sx={{
                  flexGrow: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  textAlign: 'center',
                  color: '#9e9e9e',
                }}
              >
                <QrCodeScannerIcon sx={{ fontSize: '3rem', opacity: 0.3, mb: 1 }} />
                <Typography variant="body2">
                  Scan a ticket or generate a new one to see transaction details
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      </Box>

      {billData && proceedToGenerateBill && !billGenerated && billData.paymentMethod && (
        <GenerateBill
          ticketNo={billData.ticketNo}
          entryTime={billData.createdAt}
          exitTime={billData.endAt}
          amount={billData.charge}
          type={billData.type}
          vehicleNo={billData.vehicleNo}
          paymentMethod={billData.paymentMethod}
          onComplete={() => {
            setBillGenerated(true);
            setProceedToGenerateBill(false);
          }}
        />
      )}

      {bikeData && (
        <GenerateTicket
          type="Bike"
          entryTime={bikeData.entryTime}
          ticketNo={bikeData.ticketNo}
          vehicleNo={bikeData.vehicleNo}
        />
      )}
      {carData && (
        <GenerateTicket
          type="Car"
          entryTime={carData.entryTime}
          ticketNo={carData.ticketNo}
          vehicleNo={carData.vehicleNo}
        />
      )}

      <Dialog open={openPopup} onClose={handleDialogDismiss} maxWidth="xs" fullWidth>
        <DialogTitle>Enter Vehicle Number (Optional)</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="vehicleNo"
            label="Vehicle Number"
            type="text"
            fullWidth
            variant="outlined"
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirmVehicleEntry();
              }
            }}
            placeholder="e.g., PA03AB1234"
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={handleConfirmVehicleEntry} variant="contained" color="primary">
            Enter
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={offlineDialogOpen} onClose={handleCloseOfflineDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Offline Tenant Code</DialogTitle>
        <DialogContent>
          {!offlineSelectedStaff && (
            <>
              <TextField
                autoFocus
                margin="dense"
                label="Search by name or plate"
                fullWidth
                variant="outlined"
                value={offlineSearchQuery}
                onChange={(e) => setOfflineSearchQuery(e.target.value)}
                placeholder="e.g., Ramesh or PA03AB1234"
              />
              {searchStaffResult.isFetching && (
                <Box sx={{ marginTop: 1 }}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} variant="text" height={32} />
                  ))}
                </Box>
              )}
              {!searchStaffResult.isFetching &&
                offlineSearchQuery.trim().length >= 2 &&
                (searchStaffResult.data?.length ?? 0) === 0 && (
                  <Typography variant="caption" sx={{ color: '#888', marginTop: 1, display: 'block' }}>
                    No tenants found.
                  </Typography>
                )}
              {(searchStaffResult.data?.length ?? 0) > 0 && (
                <List sx={{ maxHeight: 240, overflowY: 'auto', marginTop: 1 }}>
                  {searchStaffResult.data.map(
                    (staff: {
                      id: number;
                      name: string;
                      company: string | null;
                      license_plate: string;
                      vehicle_type: string | null;
                      card_code: string;
                    }) => (
                      <ListItemButton
                        key={staff.id}
                        onClick={() => {
                          setOfflineSelectedStaff(staff);
                          setOfflineCode('');
                        }}
                      >
                        <ListItemText
                          primary={`${staff.name} (${staff.license_plate})`}
                          secondary={staff.company ?? ''}
                        />
                      </ListItemButton>
                    )
                  )}
                </List>
              )}
            </>
          )}

          {offlineSelectedStaff && (
            <>
              <Box
                sx={{
                  marginBottom: 2,
                  padding: 1.5,
                  backgroundColor: '#f5f5f5',
                  borderRadius: 1,
                  border: '1px solid #e0e0e0',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  {offlineSelectedStaff.name}
                </Typography>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  {offlineSelectedStaff.license_plate}
                  {offlineSelectedStaff.company ? ` — ${offlineSelectedStaff.company}` : ''}
                </Typography>
                <Button
                  size="small"
                  onClick={() => {
                    setOfflineSelectedStaff(null);
                    setOfflineCode('');
                  }}
                  sx={{ display: 'block', marginTop: 0.5, fontSize: '0.7rem', textTransform: 'none' }}
                >
                  Not them? Search again
                </Button>
              </Box>
              <TextField
                autoFocus
                margin="dense"
                label="6-digit code from tenant's phone"
                fullWidth
                variant="outlined"
                value={offlineCode}
                onChange={(e) => setOfflineCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitOfflineCode();
                  }
                }}
                placeholder="123456"
                inputProps={{ inputMode: 'numeric', style: { letterSpacing: 4, fontSize: '1.2rem' } }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={handleCloseOfflineDialog} disabled={offlineSubmitting}>
            Cancel
          </Button>
          {offlineSelectedStaff && (
            <Button
              onClick={submitOfflineCode}
              variant="contained"
              color="primary"
              disabled={offlineSubmitting || offlineCode.trim().length !== 6}
            >
              {offlineSubmitting ? 'Checking...' : 'Verify'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Options;

