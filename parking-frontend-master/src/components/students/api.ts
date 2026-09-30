import { baseApiSlice } from '@/lib/public/baseApiSlice';
import { axiosInstance } from '@/lib/public/axios';
import type { PreviewResponse, Student, StudentRequest, StudentRow } from './types';

// Student parking — see backend management/student_views.py.
//   Tenant portal:
//     GET/POST parking/tenant/student-requests          (POST: JSON {students} or multipart {file})
//     POST     parking/tenant/student-requests/preview  (same body, saves nothing)
//     GET      parking/tenant/students                  (view only)
//   Admin:
//     GET      parking/student-requests?status=pending|reviewed
//     GET      parking/student-requests/<id>
//     POST     parking/student-requests/<id>/review     {approve: [ids], reject: [{id, reason}]}
//     GET      parking/students/<id>/card                (printable QR card, HTML)
//   Both: GET  parking/student-requests/template.csv
//   POS:  POST parking/student-card/scan                 {code}
const tenantRequestsApi = 'parking/tenant/student-requests';
const tenantStudentsApi = 'parking/tenant/students';
const requestsApi = 'parking/student-requests';

// A file upload or typed rows — both endpoints accept either.
export type StudentSubmission = { file: File; note?: string } | { students: StudentRow[]; note?: string };

const toBody = (submission: StudentSubmission) => {
  if ('file' in submission) {
    const form = new FormData();
    form.append('file', submission.file);
    if (submission.note) form.append('note', submission.note);
    return form;
  }
  return submission;
};

export const studentsApiSlice = baseApiSlice.injectEndpoints({
  endpoints: (builder) => ({
    previewStudentRequest: builder.mutation<PreviewResponse, StudentSubmission>({
      query: (submission) => ({ url: `${tenantRequestsApi}/preview`, method: 'POST', data: toBody(submission) }),
    }),
    submitStudentRequest: builder.mutation<StudentRequest, StudentSubmission>({
      query: (submission) => ({ url: tenantRequestsApi, method: 'POST', data: toBody(submission) }),
      invalidatesTags: ['StudentRequests', 'Students'],
    }),
    getMyStudentRequests: builder.query<StudentRequest[], void>({
      query: () => ({ url: tenantRequestsApi, method: 'GET' }),
      providesTags: ['StudentRequests'],
    }),
    getMyStudentRequest: builder.query<StudentRequest, number>({
      query: (id) => ({ url: `${tenantRequestsApi}/${id}`, method: 'GET' }),
      providesTags: ['StudentRequests'],
    }),
    getMyStudents: builder.query<Student[], void>({
      query: () => ({ url: tenantStudentsApi, method: 'GET' }),
      providesTags: ['Students'],
    }),

    getStudentRequests: builder.query<StudentRequest[], { status?: string } | void>({
      query: (params) => ({ url: requestsApi, method: 'GET', params: params ?? undefined }),
      providesTags: ['StudentRequests'],
    }),
    getStudentRequest: builder.query<StudentRequest, number>({
      query: (id) => ({ url: `${requestsApi}/${id}`, method: 'GET' }),
      providesTags: ['StudentRequests'],
    }),
    reviewStudentRequest: builder.mutation<
      StudentRequest,
      { id: number; approve?: number[]; reject?: { id: number; reason: string }[] }
    >({
      query: ({ id, ...body }) => ({ url: `${requestsApi}/${id}/review`, method: 'POST', data: body }),
      invalidatesTags: ['StudentRequests', 'Students'],
    }),

    studentCardScan: builder.mutation({
      query: ({ code }: { code: string }) => ({ url: 'parking/student-card/scan', method: 'POST', data: { code } }),
      invalidatesTags: ['Sessions'],
    }),
  }),
});

export const {
  usePreviewStudentRequestMutation,
  useSubmitStudentRequestMutation,
  useGetMyStudentRequestsQuery,
  useGetMyStudentRequestQuery,
  useGetMyStudentsQuery,
  useGetStudentRequestsQuery,
  useGetStudentRequestQuery,
  useReviewStudentRequestMutation,
  useStudentCardScanMutation,
} = studentsApiSlice;

// These two return files, not JSON, and need the auth header — so they go
// through axios directly and hand the browser a blob.
const openBlob = (blob: Blob, filename?: string) => {
  const url = URL.createObjectURL(blob);
  if (filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export async function downloadStudentTemplate() {
  const res = await axiosInstance.get(`${requestsApi}/template.csv`, { responseType: 'blob' });
  openBlob(res.data, 'student-list-template.csv');
}

export async function openStudentCard(studentId: number) {
  const res = await axiosInstance.get(`parking/students/${studentId}/card`, { responseType: 'blob' });
  openBlob(new Blob([res.data], { type: 'text/html' }));
}
