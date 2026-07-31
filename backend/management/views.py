
from django.utils import timezone
# pyrefly: ignore [missing-import]
from rest_framework import viewsets, status
# pyrefly: ignore [missing-import]
from rest_framework.decorators import action
# pyrefly: ignore [missing-import]
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.exceptions import ValidationError
from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404, render
from django.views import View
from django.http import HttpResponse
from django.template.loader import render_to_string
from rest_framework.decorators import api_view, permission_classes
from django.core.mail import EmailMessage
from django.contrib import messages
from django.urls import reverse
from django.shortcuts import redirect
from django.core.mail import EmailMultiAlternatives
from .utils import EmailThread, create_thermal_coupon_design, generate_parking_pass_pdf
from threading import Thread
from qrcode.image.pil import PilImage
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
import qrcode
from PIL import Image, ImageDraw, ImageFont
import json
import zipfile
import base64
from io import BytesIO, StringIO
from django.utils import timezone
import hmac
from django.core.management import call_command
from datetime import datetime, timedelta
import tempfile
from rest_framework.permissions import AllowAny
from django.conf import settings


# WeasyPrint needs GTK native libraries which may be missing (notably on
# Windows); defer its import to PDF-generation call time so the app can
# start without them.
def HTML(*args, **kwargs):
    from weasyprint import HTML as _HTML
    return _HTML(*args, **kwargs)


def CSS(*args, **kwargs):
    from weasyprint import CSS as _CSS
    return _CSS(*args, **kwargs)


from .models import (
    ParkingConfiguration, PricingPlan, VehicleType, Vendor, Staff, Coupon,
    ParkingPass, ParkingSession, CouponBatch, CardScanLog  # <-- ADD CouponBatch to imports
)
from .serializers import (
    ParkingConfigurationSerializer, PricingPlanSerializer, VehicleTypeSerializer,
    VendorSerializer, StaffSerializer, CouponSerializer, ParkingPassSerializer,
    ParkingSessionSerializer, CouponBatchSerializer  # <-- ADD CouponBatchSerializer to imports
)


# --- Foundational Model Views (No Changes) ---

class ParkingConfigurationView(APIView):
    """
    A view to retrieve and update the singleton Parking Configuration.
    """

    def get(self, request, format=None):
        config = ParkingConfiguration.get_solo()
        serializer = ParkingConfigurationSerializer(config)
        return Response(serializer.data)

    def patch(self, request, format=None):
        config = ParkingConfiguration.get_solo()
        serializer = ParkingConfigurationSerializer(config, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PricingPlanViewSet(viewsets.ModelViewSet):
    queryset = PricingPlan.objects.all()
    serializer_class = PricingPlanSerializer


class VehicleTypeViewSet(viewsets.ModelViewSet):
    queryset = VehicleType.objects.all()
    serializer_class = VehicleTypeSerializer


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer


class StaffViewSet(viewsets.ModelViewSet):
    queryset = Staff.objects.all()
    serializer_class = StaffSerializer


class CouponViewSet(viewsets.ModelViewSet):
    # Modified queryset to improve performance when dealing with batches
    queryset = Coupon.objects.select_related('issued_by', 'batch').all()
    serializer_class = CouponSerializer


class ParkingPassViewSet(viewsets.ModelViewSet):
    queryset = ParkingPass.objects.all()
    serializer_class = ParkingPassSerializer


# --- NEW CouponBatchViewSet ---

class CouponBatchViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing bulk purchases of coupons by vendors.

    Creating a new CouponBatch will automatically generate the specified
    number of individual Coupon objects. Use the 'printable-list' action
    for a simple list of codes.
    """
    # Use prefetch_related for a massive performance boost when loading coupons
    queryset = CouponBatch.objects.select_related('vendor').prefetch_related('coupons').all()
    serializer_class = CouponBatchSerializer

    @action(detail=True, methods=['get'], url_path='printable-list')
    def printable_list(self, request, pk=None):
        """
        Provides a simple, clean list of all coupon codes in this batch,
        ideal for printing or exporting.
        """
        batch = self.get_object()
        # Efficiently get just the codes from the related coupons
        coupon_codes = batch.coupons.values_list('code', flat=True)
        return Response({
            'batch_id': batch.id,
            'vendor': batch.vendor.name,
            'number_of_coupons': batch.number_of_coupons,
            'coupon_codes': list(coupon_codes)
        })


class CouponBatchDownloadView(View):
    def get(self, request, *args, **kwargs):
        batch = get_object_or_404(CouponBatch, pk=kwargs['object_id'])
        coupons = batch.coupons.all()
        return self.generate_coupon_pdf(batch, coupons)

    def generate_coupon_pdf(self, batch, coupons):
        """Generate a PDF document with each coupon on its own page"""
        # Prepare coupon images as base64
        coupon_images = []
        for coupon in coupons:
            img = create_thermal_coupon_design(batch, coupon)
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            coupon_images.append(img_str)

        # Generate HTML with page breaks
        html_string = render_to_string('admin/management/coupon_batch_pdf_template.html', {
            'batch': batch,
            'coupon_images': coupon_images,
            'now': timezone.now().strftime("%Y-%m-%d %H:%M")
        })

        # Generate PDF
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="coupon_batch_{batch.id}.pdf"'
        HTML(string=html_string).write_pdf(response)
        return response

    def create_thermal_coupon_design(self, batch, coupon):
        # Use a width that will scale to 100% of thermal printer paper
        # Height is calculated based on content but start with more space
        width = 576  # Standard width at 72 DPI that will scale well
        height = 450  # Increased height to accommodate QR code and text

        # Create image with white background
        img = Image.new('RGB', (width, height), 'white')
        draw = ImageDraw.Draw(img)

        # Thermal printer colors (black only)
        primary_color = '#000000'  # Black
        border_color = '#000000'  # Black

        # Use monospace fonts for better alignment
        try:
            title_font = ImageFont.truetype("arialbd.ttf", 24)  # Bold for headers
            text_font = ImageFont.truetype("arial.ttf", 16)  # Regular for text
            code_font = ImageFont.truetype("arialbd.ttf", 20)  # Bold for code
            small_font = ImageFont.truetype("arial.ttf", 12)  # Small text
        except:
            # Fallback to default font
            title_font = ImageFont.load_default()
            text_font = ImageFont.load_default()
            code_font = ImageFont.load_default()
            small_font = ImageFont.load_default()

        # Calculate positions dynamically - CONVERT TO INTEGERS
        margin = int(width * 0.05)  # 5% margin - converted to int
        current_y = margin

        # Header
        header_text = "PARKING COUPON"
        draw.text((margin, current_y), header_text, fill=primary_color, font=title_font)
        current_y += 40

        # Vendor name
        vendor_text = f"{batch.vendor.name.upper()}"
        draw.text((margin, current_y), vendor_text, fill=primary_color, font=text_font)
        current_y += 30

        # Divider line
        draw.line([(margin, current_y), (width - margin, current_y)], fill=primary_color, width=2)
        current_y += 20

        # QR code (right aligned) - CONVERT TO INTEGERS
        qr_size = int(width * 0.25)  # Reduced to 25% of width for better layout
        qr_start_y = current_y  # Remember where QR section starts

        qr = qrcode.QRCode(
            version=1,
            box_size=4,
            border=1
        )
        qr.add_data(coupon.code)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)

        # FIXED: Convert coordinates to integers
        qr_x = int(width - margin - qr_size)
        img.paste(qr_img, (qr_x, current_y))

        # Left side content - ensure it doesn't overlap with QR code
        content_width = int(width - margin * 3 - qr_size)  # Space available for text
        line_spacing = 25

        # Coupon details - keep text in left column
        details = [
            ("CODE:", coupon.code),
            ("MINUTES:", f"{batch.value_minutes}"),
            ("VALID:", batch.valid_from.strftime("%m/%d/%Y %I:%M %p") if batch.valid_from else "N/A"),
            ("EXPIRES:", batch.valid_until.strftime("%m/%d/%Y %I:%M %p") if batch.valid_until else "N/A"),
        ]


        detail_start_y = current_y
        for label, value in details:
            # Ensure text stays in left area (doesn't overlap QR)
            max_text_x = qr_x - 10  # 10px buffer from QR code

            # Draw label
            draw.text((margin, current_y), label, fill=primary_color, font=text_font)

            # Draw value - ensure it doesn't extend into QR area
            value_x = margin + 100
            if label == "CODE:":
                # For code, check if it's too long and wrap if needed
                code_text = str(value)
                code_width = draw.textlength(code_text, font=code_font)
                available_width = max_text_x - value_x

                if code_width > available_width:
                    # Split code into multiple lines if too long
                    mid_point = len(code_text) // 2
                    line1 = code_text[:mid_point]
                    line2 = code_text[mid_point:]
                    draw.text((value_x, current_y), line1, fill=primary_color, font=code_font)
                    draw.text((value_x, current_y + 15), line2, fill=primary_color, font=code_font)
                    current_y += 15  # Extra space for second line
                else:
                    draw.text((value_x, current_y), code_text, fill=primary_color, font=code_font)
            else:
                draw.text((value_x, current_y), value, fill=primary_color, font=text_font)

            current_y += line_spacing

        # Bottom section - ensure we're below both text and QR code
        qr_bottom = qr_start_y + qr_size + 10  # QR code bottom + buffer
        text_bottom = current_y + 10  # Text bottom + buffer
        current_y = max(qr_bottom, text_bottom)

        # Divider line
        draw.line([(margin, current_y), (width - margin, current_y)], fill=primary_color, width=1)
        current_y += 15

        # Instructions - CONVERT TO INTEGERS
        instructions = "PRESENT THIS COUPON FOR PARKING VALIDATION"
        instr_width = draw.textlength(instructions, font=small_font)
        instr_x = int((width - instr_width) / 2)  # converted to int
        draw.text((instr_x, current_y), instructions, fill=primary_color, font=small_font)
        current_y += 20

        # Batch ID
        batch_text = f"BATCH #{batch.id}"
        batch_text_width = draw.textlength(batch_text, font=small_font)
        batch_text_x = int((width - batch_text_width) / 2)
        draw.text((batch_text_x, current_y), batch_text, fill=primary_color, font=small_font)

        # Add dashed "cut here" line - CONVERT TO INTEGERS
        dash_length = 10
        for x in range(int(margin), int(width - margin), dash_length * 2):
            draw.line([(x, current_y + 15), (x + dash_length, current_y + 15)], fill=primary_color, width=2)

        # Crop to actual content height
        img = img.crop((0, 0, width, current_y + 30))

        return img


class CouponBatchEmailView(View):
    def get(self, request, *args, **kwargs):
        batch = CouponBatch.objects.get(pk=kwargs['object_id'])
        vendor = batch.vendor

        if not vendor.contact_email:
            messages.error(request, "Vendor has no email address configured.")
            return redirect('admin:management_couponbatch_changelist')

        # Generate the PDF
        pdf_buffer = BytesIO()
        pdf_response = CouponBatchDownloadView().generate_coupon_pdf(batch, batch.coupons.all())
        pdf_buffer.write(pdf_response.content)
        pdf_buffer.seek(0)

        # Email subject and body
        subject = f"Your Coupon Batch #{batch.id} - Printable Coupons"
        html_body = render_to_string('admin/management/email/coupon_batch_email.html', {
            'batch': batch,
            'vendor': vendor,
        })

        # Create email
        email = EmailMultiAlternatives(
            subject=subject,
            body="This email contains HTML content. Please use an HTML-compatible email client.",
            to=[vendor.contact_email]
        )
        email.attach_alternative(html_body, "text/html")

        # Attach PDF file
        email.attach(
            filename=f'coupon_batch_{batch.id}.pdf',
            content=pdf_buffer.getvalue(),
            mimetype='application/pdf'
        )

        try:
            EmailThread(email).start()
            messages.success(request, f"Email sent successfully to {vendor.contact_email}")
        except Exception as e:
            messages.error(request, f"Failed to send email: {str(e)}")
        finally:
            pdf_buffer.close()

        return redirect('admin:management_couponbatch_changelist')

    def generate_coupon_pdf(self, batch):
        """Generate a PDF document with each coupon on its own page"""
        from weasyprint import HTML
        from io import BytesIO
        import base64

        # Prepare coupon images as base64
        coupon_images = []
        for coupon in batch.coupons.all():
            img = create_thermal_coupon_design(batch, coupon)
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            coupon_images.append(img_str)

        # Generate HTML with page breaks
        html_string = render_to_string('admin/management/coupon_batch_pdf_template.html', {
            'batch': batch,
            'coupon_images': coupon_images,
            'now': timezone.now().strftime("%Y-%m-%d %H:%M")
        })

        # Generate PDF
        pdf_buffer = BytesIO()
        HTML(string=html_string).write_pdf(pdf_buffer)
        pdf_buffer.seek(0)
        return pdf_buffer


class CouponBatchPrintView(View):
    def get(self, request, *args, **kwargs):
        batch = get_object_or_404(CouponBatch, pk=kwargs['object_id'])
        coupons = batch.coupons.all()

        if request.GET.get('format') == 'pdf':
            return self.generate_coupon_pdf(batch, coupons)
        else:
            return self.generate_print_preview(batch, coupons)

    def generate_print_preview(self, batch, coupons):
        coupon_images = []
        for coupon in coupons:
            try:
                coupon_img = create_thermal_coupon_design(batch, coupon)
                with BytesIO() as img_buffer:
                    coupon_img.save(img_buffer, format='PNG', dpi=(300, 300))
                    img_data = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
                    coupon_images.append(img_data)
            except Exception as e:
                print(f"Error generating image for {coupon.code}: {str(e)}")
                continue

        context = {
            'batch': batch,
            'coupon_images': coupon_images,
            'now': timezone.now().strftime("%Y-%m-%d %H:%M"),
            'print_mode': True,
        }

        html = render_to_string('admin/management/coupon_print_preview.html', context)
        response = HttpResponse(html)
        if self.request.GET.get('print'):
            response['Refresh'] = '0;url=javascript:window.print()'
        return response

    def generate_coupon_pdf(self, batch, coupons):
        """Generate a PDF document with each coupon on its own page"""
        coupon_images = []
        for coupon in coupons:
            img = create_thermal_coupon_design(batch, coupon)
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            coupon_images.append(img_str)

        context = {
            'batch': batch,
            'coupon_images': coupon_images,
            'now': timezone.now().strftime("%Y-%m-%d %H:%M")
        }

        html_string = render_to_string('admin/management/coupon_batch_pdf_template.html', context)
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="coupon_batch_{batch.id}.pdf"'
        HTML(string=html_string).write_pdf(response)
        return response

# Add this new view class for emailing staff passes
class ParkingPassEmailView(View):
    def get(self, request, *args, **kwargs):
        parking_pass = ParkingPass.objects.get(pk=kwargs['object_id'])
        staff = parking_pass.staff

        if not staff.email:
            messages.error(request, "Staff member has no email address configured.")
            return redirect('admin:management_parkingpass_changelist')

        # Generate the QR code
        qr_data = parking_pass.staff.license_plate
        qr_code = ParkingPassPrintView().generate_qr_code(qr_data)

        # Generate PDF
        pdf_buffer = generate_parking_pass_pdf(parking_pass, staff, ParkingConfiguration.get_solo(), qr_code, request)

        subject = f"Your Parking Pass - {parking_pass.staff.name}"
        html_body = render_to_string('admin/management/email/staff_pass_email.html', {
            'pass': parking_pass,
            'staff': staff,
            'now': timezone.now().strftime("%Y-%m-%d %H:%M")
        })

        email = EmailMultiAlternatives(
            subject=subject,
            body="This email contains HTML content. Please use an HTML-compatible email client.",
            to=[staff.email]
        )
        email.attach_alternative(html_body, "text/html")

        # Attach PDF
        email.attach(
            filename=f'parking_pass.pdf',
            content=pdf_buffer.getvalue(),
            mimetype='application/pdf'
        )

        try:
            EmailThread(email).start()
            messages.success(request, f"Email sent successfully to {staff.email}")
        except Exception as e:
            messages.error(request, f"Failed to send email: {str(e)}")
        finally:
            pdf_buffer.close()

        return redirect('admin:management_parkingpass_changelist')

# --- Core Logic ViewSet (No Changes) ---
class ParkingSessionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing parking sessions.
    """
    queryset = ParkingSession.objects.select_related(
        'vehicle_type', 'registered_staff_member', 'applied_coupon', 'applied_pass'
    ).all()
    serializer_class = ParkingSessionSerializer
    lookup_field = 'ticket_number'

    def create(self, request, *args, **kwargs):
        license_plate = request.data.get('license_plate')

        # Check for active subscription (staff pass) before creating session
        if license_plate:
            active_pass = self._check_active_subscription(license_plate)
            if active_pass:
                staff = active_pass.staff
                request.data.update({
                    'status': 'WAIVED',
                    'applied_pass': active_pass.id,
                    'registered_staff_member': staff.id,
                    'vehicle_type': staff.vehicle_type.id if staff.vehicle_type else None
                })

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                self.perform_create(serializer)
        except IntegrityError:
            return Response(
                {"error": "A ticket number conflict occurred. Please try again."},
                status=status.HTTP_409_CONFLICT
            )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'], url_path='calculate-charge')
    def calculate_charge(self, request, ticket_number=None):
        session = self.get_object()

        # Check for active subscription if not already waived
        if session.status != 'WAIVED' and session.license_plate:
            active_pass = self._check_active_subscription(session.license_plate)
            if active_pass:
                staff = active_pass.staff
                session.applied_pass = active_pass
                session.registered_staff_member = staff
                session.status = 'WAIVED'
                session.vehicle_type = staff.vehicle_type  # Update vehicle type from staff record
                session.calculated_charge = 0
                session.exit_time = timezone.now()
                session.save()
                serializer = self.get_serializer(session)
                return Response(serializer.data)

        # Proceed with normal calculation if no active subscription
        if session.status not in ['ACTIVE', 'COMPLETED']:
            return Response(
                {'error': f'Cannot calculate charge for session with status "{session.status}".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        session.exit_time = timezone.now()
        session.update_and_calculate_charges()
        session.save()

        serializer = self.get_serializer(session)
        return Response(serializer.data)

    def _check_active_subscription(self, license_plate):
        """
        Helper method to check for active subscription (staff pass) for a given license plate.
        Returns the active ParkingPass object if found, None otherwise.
        """
        staff = Staff.objects.filter(license_plate=license_plate).first()
        if not staff:
            return None
        return ParkingPass.objects.filter(
            staff=staff,
            valid_from__lte=timezone.now(),
            valid_until__gte=timezone.now(),
            is_active=True
        ).first()

    @action(detail=True, methods=['post'], url_path='apply-coupon')
    def apply_coupon(self, request, ticket_number=None):
        session = self.get_object()
        coupon_code = request.data.get('coupon_code')
        if not coupon_code:
            return Response({'error': 'coupon_code is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session.apply_coupon(coupon_code)
            session.save()
            if session.exit_time:
                session.update_and_calculate_charges()
                session.save()
            serializer = self.get_serializer(session)
            return Response(serializer.data)
        except (Coupon.DoesNotExist, ValidationError) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, ticket_number=None):
        session = self.get_object()
        payment_method = request.data.get('payment_method')

        if session.status not in ['COMPLETED', 'WAIVED']:
            return Response(
                {
                    'error': 'Session must be in COMPLETED or WAIVED status to be marked as paid. Please calculate charge first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not payment_method or payment_method not in [c[0] for c in ParkingSession.PAYMENT_METHOD_CHOICES]:
            return Response({'error': 'A valid payment_method is required.'}, status=status.HTTP_400_BAD_REQUEST)

        session.mark_as_paid(method=payment_method)
        session.save()
        serializer = self.get_serializer(session)
        return Response(serializer.data)


class ParkingPassPrintView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        try:
            object_id = kwargs.get('object_id')
            parking_pass = get_object_or_404(ParkingPass, pk=object_id)
            config = ParkingConfiguration.get_solo()

            qr_data = parking_pass.staff.license_plate
            qr_code = self.generate_qr_code(qr_data)

            context = {
                'pass': parking_pass,
                'staff': parking_pass.staff,
                'config': config,
                'qr_code': qr_code,
                'print_mode': request.GET.get('print', False),
                'STATIC_URL': settings.STATIC_URL,  # Important for static files
            }

            if request.GET.get('format') == 'pdf':
                # Generate HTML
                html_string = render_to_string('admin/management/staff/pass_printable.html', context)

                # Create PDF in memory
                pdf_file = BytesIO()

                # Generate PDF with absolute URLs
                HTML(
                    string=html_string,
                    base_url=request.build_absolute_uri('/')
                ).write_pdf(
                    target=pdf_file,
                    stylesheets=[CSS(string='@page { size: letter; margin: 0.5in; }')],
                    presentational_hints=True
                )

                # Create response
                response = HttpResponse(pdf_file.getvalue(), content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="parking_pass.pdf"'
                return response

            # HTML version
            html_string = render_to_string('admin/management/staff/pass_printable.html', context)
            response = HttpResponse(html_string)
            if request.GET.get('print'):
                response['Refresh'] = '0;url=javascript:window.print()'
            return response

        except Exception as e:
            # logger.error(f"Failed to generate parking pass PDF: {str(e)}")
            return HttpResponse(
                f"Failed to generate PDF: {str(e)}",
                status=500,
                content_type='text/plain'
            )

    def generate_qr_code(self, data):
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=4,
            border=2,
        )
        qr.add_data(data)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        return base64.b64encode(buffered.getvalue()).decode()


def _find_open_session_for_staff(staff):
    """
    The one session for this staff member that has an entry but no exit yet,
    regardless of which calendar day it started on (handles overnight stays).
    """
    return ParkingSession.objects.filter(
        registered_staff_member=staff,
        exit_time__isnull=True
    ).order_by('-entry_time').first()


class StaffCardPrintView(APIView):
    """
    Prints/downloads a tenant's permanent parking card (QR encodes card_code).
    """
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        try:
            object_id = kwargs.get('object_id')
            staff = get_object_or_404(Staff, card_code=object_id)

            context = {
                'staff': staff,
                'qr_code': staff.generate_card_qr_code(),
                'print_mode': request.GET.get('print', False),
                'STATIC_URL': settings.STATIC_URL,
            }

            if request.GET.get('format') == 'pdf':
                html_string = render_to_string('admin/management/staff/tenant_card_printable.html', context)
                pdf_file = BytesIO()
                HTML(
                    string=html_string,
                    base_url=request.build_absolute_uri('/')
                ).write_pdf(
                    target=pdf_file,
                    stylesheets=[CSS(string='@page { size: letter; margin: 0.5in; }')],
                    presentational_hints=True
                )
                response = HttpResponse(pdf_file.getvalue(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="tenant_card.pdf"'
                return response

            html_string = render_to_string('admin/management/staff/tenant_card_printable.html', context)
            response = HttpResponse(html_string)
            if request.GET.get('print'):
                response['Refresh'] = '0;url=javascript:window.print()'
            return response

        except Exception as e:
            return HttpResponse(
                f"Failed to generate card: {str(e)}",
                status=500,
                content_type='text/plain'
            )


class StaffCardDigitalView(APIView):
    """
    Digital card viewer — the QR here encodes a short-lived signed token
    (Staff.generate_digital_token), not the raw card_code. The page polls
    /token/ every DIGITAL_TOKEN_MAX_AGE - 15 seconds and redraws the QR, so a
    screenshot of this screen goes stale within a minute. This is what
    should be emailed/linked to the tenant instead of the raw card image.
    """
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        object_id = kwargs.get('object_id')
        staff = get_object_or_404(Staff, card_code=object_id)
        if not staff.is_card_active:
            return HttpResponse('This card has been deactivated. Contact the office.', status=403)

        context = {
            'staff': staff,
            'qr_code': staff.generate_digital_qr_code(),
            'refresh_seconds': max(Staff.DIGITAL_TOKEN_MAX_AGE - 15, 15),
            'token_url': reverse('staff-card-token', args=[staff.card_code]),
            'STATIC_URL': settings.STATIC_URL,
        }
        html_string = render_to_string('admin/management/staff/tenant_card_digital.html', context)
        return HttpResponse(html_string)


@api_view(['GET'])
@permission_classes([AllowAny])
def staff_card_token(request, object_id):
    """Returns a fresh signed QR for the digital card view to poll."""
    staff = get_object_or_404(Staff, card_code=object_id)
    if not staff.is_card_active:
        return Response({'error': 'card deactivated'}, status=status.HTTP_403_FORBIDDEN)
    return Response({
        'qr_code': staff.generate_digital_qr_code(),
        'expires_in': Staff.DIGITAL_TOKEN_MAX_AGE,
    })


SCAN_RATE_LIMIT_SECONDS = 30  # reject a repeat scan of the same card faster than this


def _card_source(raw_value):
    return 'DIGITAL' if ':' in raw_value else 'PHYSICAL'


def _rate_limited(staff):
    cutoff = timezone.now() - timedelta(seconds=SCAN_RATE_LIMIT_SECONDS)
    return CardScanLog.objects.filter(
        staff=staff, scanned_at__gte=cutoff
    ).exclude(action='REJECTED').exists()


def _resolve_staff_from_scan(raw_card_code):
    """
    Returns (staff, source, error_response). error_response is a DRF Response
    if resolution failed, in which case staff/source are None.
    """
    source = _card_source(raw_card_code)
    resolved_code = Staff.resolve_scanned_code(raw_card_code)
    if resolved_code is None:
        CardScanLog.objects.create(
            card_code_used=raw_card_code[:64], action='REJECTED', source=source,
            reject_reason='expired or invalid digital token',
        )
        return None, None, Response(
            {'error': 'This digital card has expired. Refresh the app and rescan.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        staff = Staff.objects.select_related('company', 'vehicle_type').get(card_code=resolved_code)
    except (Staff.DoesNotExist, ValueError, ValidationError):
        CardScanLog.objects.create(
            card_code_used=raw_card_code[:64], action='REJECTED', source=source,
            reject_reason='no matching card',
        )
        return None, None, Response({'error': 'No tenant found for this card'}, status=status.HTTP_404_NOT_FOUND)

    if not staff.is_card_active:
        CardScanLog.objects.create(
            staff=staff, card_code_used=raw_card_code[:64], action='REJECTED', source=source,
            reject_reason='card deactivated',
        )
        return None, None, Response(
            {'error': 'This card has been deactivated. Contact the office.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if _rate_limited(staff):
        CardScanLog.objects.create(
            staff=staff, card_code_used=raw_card_code[:64], action='REJECTED', source=source,
            reject_reason='rate limited',
        )
        return None, None, Response(
            {'error': 'This card was just scanned. Wait a moment and try again.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    return staff, source, None


@api_view(['POST'])
def tenant_card_scan(request):
    """
    Step 1 of the tenant-card flow: look up the card, do NOT write anything.
    Lets the operator visually confirm the returned license plate against the
    physical car before committing an entry/exit.
    """
    card_code = request.data.get('card_code')
    if not card_code:
        return Response({'error': 'card_code is required'}, status=status.HTTP_400_BAD_REQUEST)

    staff, source, error_response = _resolve_staff_from_scan(card_code)
    if error_response:
        return error_response

    open_session = _find_open_session_for_staff(staff)

    return Response({
        'action': 'exit' if open_session else 'entry',
        'staff': {
            'id': staff.id,
            'name': staff.name,
            'company': staff.company.name if staff.company else None,
            'license_plate': staff.license_plate,
            'vehicle_type': staff.vehicle_type.name if staff.vehicle_type else None,
        },
        'open_session': {
            'ticket_number': open_session.ticket_number,
            'entry_time': open_session.entry_time,
        } if open_session else None,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
def tenant_card_confirm(request):
    """
    Step 2 of the tenant-card flow: operator has visually matched the plate,
    commit the entry or exit. On exit, defers to
    ParkingSession.update_and_calculate_charges() so an active ParkingPass
    waives the charge and everyone else gets billed from their vehicle
    type's pricing plan, same as a walk-in ticket.
    """
    card_code = request.data.get('card_code')
    if not card_code:
        return Response({'error': 'card_code is required'}, status=status.HTTP_400_BAD_REQUEST)

    staff, source, error_response = _resolve_staff_from_scan(card_code)
    if error_response:
        return error_response

    if not staff.vehicle_type:
        return Response({'error': 'Tenant has no assigned vehicle type'}, status=status.HTTP_400_BAD_REQUEST)

    open_session = _find_open_session_for_staff(staff)

    if open_session:
        open_session.exit_time = timezone.now()
        open_session.update_and_calculate_charges()
        open_session.save()

        CardScanLog.objects.create(staff=staff, card_code_used=str(staff.card_code), action='EXIT', source=source)

        serializer = ParkingSessionSerializer(open_session)
        return Response({
            'action': 'exit',
            'session': serializer.data,
        }, status=status.HTTP_200_OK)

    new_session = ParkingSession.objects.create(
        vehicle_type=staff.vehicle_type,
        license_plate=staff.license_plate,
        registered_staff_member=staff,
        entry_time=timezone.now(),
        status='ACTIVE'
    )

    CardScanLog.objects.create(staff=staff, card_code_used=str(staff.card_code), action='ENTRY', source=source)

    serializer = ParkingSessionSerializer(new_session)
    return Response({
        'action': 'entry',
        'session': serializer.data,
    }, status=status.HTTP_201_CREATED)


# --- Dev-only: refresh local/staging DB with sample data -------------------

@api_view(['POST'])
@permission_classes([AllowAny])
def dev_sync_db(request):
    """
    Dev/staging convenience endpoint: runs `migrate` then `seed_parking_data
    --flush` so a frontend developer can refresh their DB with realistic
    sample data without SSH or direct DB access.

    Hard-refuses on production (settings.ENVIRONMENT == "production") and
    requires a shared secret in the X-Sync-Token header, matched against
    settings.DEV_SYNC_TOKEN with a constant-time comparison. If
    DEV_SYNC_TOKEN isn't configured, the endpoint fails closed.
    """
    if settings.ENVIRONMENT == 'production':
        return Response(
            {'success': False, 'error': 'Refused: disabled when settings.ENVIRONMENT == "production".'},
            status=status.HTTP_403_FORBIDDEN,
        )

    expected_token = settings.DEV_SYNC_TOKEN
    provided_token = request.headers.get('X-Sync-Token')
    if not expected_token:
        return Response(
            {'success': False, 'error': 'DEV_SYNC_TOKEN is not configured on the server.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    if not provided_token or not hmac.compare_digest(provided_token, expected_token):
        return Response(
            {'success': False, 'error': 'Missing or invalid X-Sync-Token header.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        count = int(request.data.get('count', 30))
        if count < 1:
            raise ValueError
    except (TypeError, ValueError):
        return Response({'success': False, 'error': '"count" must be a positive integer.'}, status=status.HTTP_400_BAD_REQUEST)

    output = {}
    try:
        migrate_stdout, migrate_stderr = StringIO(), StringIO()
        call_command('migrate', stdout=migrate_stdout, stderr=migrate_stderr)
        output['migrate'] = {'stdout': migrate_stdout.getvalue(), 'stderr': migrate_stderr.getvalue()}

        seed_stdout, seed_stderr = StringIO(), StringIO()
        call_command('seed_parking_data', flush=True, count=count, stdout=seed_stdout, stderr=seed_stderr)
        output['seed_parking_data'] = {'stdout': seed_stdout.getvalue(), 'stderr': seed_stderr.getvalue()}
    except Exception as exc:
        return Response(
            {'success': False, 'error': str(exc), 'output': output},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({'success': True, 'output': output}, status=status.HTTP_200_OK)