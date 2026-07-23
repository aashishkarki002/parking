import { validationMsg } from '@/constants/common/values';
import * as Yup from 'yup';

export const validationSchemaLogin = Yup.object().shape({
  persona: Yup.string().when('showForgetPassword', {
    is: (val: boolean | undefined) => val !== undefined || val !== false,
    then: (schema) => schema.required(validationMsg.required),
  }),
  password: Yup.string().when('showForgetPassword', {
    is: (val: boolean | undefined) => val !== undefined || val !== false,
    then: (schema) => schema.required(validationMsg.required),
  }),
  showForgetPassword: Yup.boolean(),
  email: Yup.string().when('showForgetPassword', {
    is: true,
    then: (schema) => schema.required(validationMsg.required),
  }),
});

