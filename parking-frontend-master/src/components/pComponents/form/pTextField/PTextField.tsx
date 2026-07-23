'use client';
import { extractResponseError } from '@/functions/handleErrorFn';
import { publicCommonAppSelector } from '@/lib/public/commonRedux/selector';
import { remove400ErrorField } from '@/lib/public/commonRedux/slice';
import { useAppDispatch, useAppSelector } from '@/lib/public/hooks';
import { Grid } from '@mui/material';
import { Controller } from 'react-hook-form';
import AppTextField from '@/components/cComponents/form/appTextField/AppTextField';
import type { IPTextFieldProps } from './types';

const PTextField = ({ xs, sm, md, lg, name, control, onFocus, ...rest }: IPTextFieldProps) => {
  const dispatch = useAppDispatch();
  const { errors400 } = useAppSelector(publicCommonAppSelector);

  const responseError = extractResponseError({
    name: name,
    errors: errors400,
  });

  const handleDefaultFocus = () => {
    if (responseError !== undefined) {
      dispatch(remove400ErrorField(name));
    }
    if (onFocus) {
      onFocus();
    }
  };

  return (
    <Grid item xs={xs} sm={sm} md={md} lg={lg}>
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState }) => {
          const { disabled, name, value, onChange, onBlur } = field;
          return (
            <AppTextField
              disabled={disabled}
              name={name}
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              error={fieldState?.error}
              hasError={responseError !== undefined || fieldState?.error !== undefined}
              resError={responseError}
              handleDefaultFocus={handleDefaultFocus}
              {...rest}
            />
          );
        }}
      />
    </Grid>
  );
};

export default PTextField;

