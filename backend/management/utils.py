from threading import Thread
# pyrefly: ignore [missing-import]
from PIL import Image, ImageDraw, ImageFont
import qrcode
from io import BytesIO
from django.template.loader import render_to_string
from django.conf import settings
from django.utils.timezone import localtime


class EmailThread(Thread):
    def __init__(self, email):
        self.email = email
        Thread.__init__(self)

    def run(self):
        self.email.send()


def create_thermal_coupon_design(batch, coupon, target_width=472):
    # Create image with calculated height (we'll determine this dynamically)
    img = Image.new('RGB', (target_width, 1000), 'white')  # Temporary height
    draw = ImageDraw.Draw(img)
    primary_color = '#000000'

    # Font setup with consistent sizing
    try:
        title_font = ImageFont.truetype("arialbd.ttf", 24)
        header_font = ImageFont.truetype("arialbd.ttf", 18)
        label_font = ImageFont.truetype("arialbd.ttf", 16)
        value_font = ImageFont.truetype("arial.ttf", 16)
        small_font = ImageFont.truetype("arial.ttf", 12)
    except:
        # Fallback to default fonts if Arial not available
        title_font = ImageFont.load_default()
        header_font = ImageFont.load_default()
        label_font = ImageFont.load_default()
        value_font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    # Calculate margins and spacing
    margin = int(target_width * 0.08)
    line_spacing = 20
    current_y = margin

    # Header Section - Centered
    header_text = "PARKING COUPON"
    header_width = draw.textlength(header_text, font=title_font)
    draw.text(((target_width - header_width) / 2, current_y), header_text, fill=primary_color, font=title_font)
    current_y += 30

    # Vendor Name - Centered
    vendor_text = f"{batch.vendor.name.upper()}"
    vendor_width = draw.textlength(vendor_text, font=header_font)
    draw.text(((target_width - vendor_width) / 2, current_y), vendor_text, fill=primary_color, font=header_font)
    current_y += 30

    # Divider Line
    draw.line([(margin, current_y), (target_width - margin, current_y)], fill=primary_color, width=2)
    current_y += 20

    # Main Content Area
    qr_size = int(target_width * 0.28)  # QR code size (28% of width)
    text_area_width = target_width - qr_size - 3 * margin

    # QR Code (Right Side)
    qr = qrcode.QRCode(version=1, box_size=4, border=1)
    qr.add_data(coupon.code)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)
    qr_y = current_y + 10  # Slight padding from divider
    img.paste(qr_img, (target_width - qr_size - margin, qr_y))

    # Left Side Text (Properly Aligned)
    text_start_x = margin
    text_start_y = current_y + 10

    # Create consistent label-value pairs
    details = [
        ("CODE:", coupon.code, True),  # Bold for code
        ("MINUTES:", str(batch.value_minutes), False),
        ("VALID:", localtime(batch.valid_from).strftime("%m/%d/%Y %I:%M %p") if batch.valid_from else "N/A", False),
        ("EXPIRES:", localtime(batch.valid_until).strftime("%m/%d/%Y %I:%M %p") if batch.valid_until else "N/A", False)
    ]

    # Calculate max label width for alignment
    max_label_width = max(draw.textlength(label, font=label_font) for label, _, _ in details)

    # Draw each detail line
    for label, value, is_bold in details:
        # Draw label (right-aligned to max width)
        draw.text((text_start_x, text_start_y), label, fill=primary_color, font=label_font)

        # Draw value with consistent left margin
        value_x = text_start_x + max_label_width + 10
        value_font_to_use = header_font if is_bold else value_font
        draw.text((value_x, text_start_y), value, fill=primary_color, font=value_font_to_use)

        text_start_y += line_spacing

    current_y += max(qr_size, text_start_y - current_y) + 20

    # Bottom Divider
    draw.line([(margin, current_y), (target_width - margin, current_y)], fill=primary_color, width=1)
    current_y += 20

    # Instructions - Centered
    instructions = "PRESENT THIS COUPON FOR PARKING VALIDATION"
    instr_width = draw.textlength(instructions, font=small_font)
    draw.text(((target_width - instr_width) / 2, current_y), instructions, fill=primary_color, font=small_font)
    current_y += 25

    # Batch ID - Centered
    batch_text = f"BATCH #{batch.id}"
    batch_width = draw.textlength(batch_text, font=small_font)
    draw.text(((target_width - batch_width) / 2, current_y), batch_text, fill=primary_color, font=small_font)
    current_y += 25

    # Cut Line (Dashed)
    dash_length = 10
    for x in range(margin, target_width - margin, dash_length * 2):
        draw.line([(x, current_y), (x + dash_length, current_y)], fill=primary_color, width=2)
    current_y += 15

    # Crop to actual content height
    img = img.crop((0, 0, target_width, current_y))
    return img


def generate_parking_pass_pdf(parking_pass, staff, config, qr_code, request=None):
    # WeasyPrint needs GTK native libraries; import lazily so the rest of the
    # app (migrate, runserver) works on machines without them installed.
    from weasyprint import HTML, CSS

    context = {
        'pass': parking_pass,
        'staff': staff,
        'config': config,
        'qr_code': qr_code,
        'STATIC_URL': settings.STATIC_URL,
    }

    html_string = render_to_string('admin/management/staff/pass_printable.html', context)
    pdf_file = BytesIO()

    # If request is present, use base_url for static files resolution
    base_url = request.build_absolute_uri('/') if request else None

    HTML(string=html_string, base_url=base_url).write_pdf(
        target=pdf_file,
        stylesheets=[CSS(string='@page { size: letter; margin: 0.5in; }')],
        presentational_hints=True
    )

    pdf_file.seek(0)
    return pdf_file