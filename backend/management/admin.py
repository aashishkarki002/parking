# management/admin.py
from datetime import timedelta
from django import forms
from django.contrib import admin
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html
from django.db.models import Sum
from decimal import Decimal
from rangefilter.filters import DateRangeFilter
from . import views
from user_app.models import User
from user_app.roles import TENANT
import uuid
from .models import (
    ParkingConfiguration, PricingPlan, VehicleType,
    Vendor, Staff, Coupon, CouponBatch,
    ParkingPass, ParkingSession, CardScanLog, TicketStamp, TenantBill, RFIDCard,
    Student, StudentRequest,
)


# =============================================
# 1. CUSTOM ADMIN SITE CLASS (FIXED VERSION)
# =============================================
class ParkingAdminSite(admin.AdminSite):
    site_header = "Parking Management System"
    site_title = "Parking Admin Portal"
    index_title = "Dashboard"

    def get_app_list(self, request, app_label=None):
        """
        Group related models in the admin index
        """
        app_list = super().get_app_list(request, app_label)

        # If app_label is specified (for app_index view), return the original list
        if app_label is not None:
            return app_list

        # Get all registered models
        registry = self._registry
        model_admins = [
            (model, model_admin)
            for model, model_admin in registry.items()
        ]

        # Organize models into groups
        config_models = [m for m in model_admins if
                         m[0].__name__ in ['ParkingConfiguration', 'PricingPlan', 'VehicleType']]
        people_models = [m for m in model_admins if m[0].__name__ in ['Vendor', 'Staff', 'RFIDCard']]
        coupon_models = [m for m in model_admins if m[0].__name__ in ['CouponBatch', 'Coupon', 'ParkingPass']]
        activity_models = [m for m in model_admins if m[0].__name__ in ['ParkingSession', 'CardScanLog', 'TicketStamp', 'TenantBill']]
        user_models = [m for m in model_admins if m[0].__name__ in ['User', 'Group']]
        student_models = [m for m in model_admins if m[0].__name__ in ['StudentRequest', 'Student']]

        # Build custom app list
        custom_app_list = []

        if config_models:
            custom_app_list.append({
                'name': 'System Configuration',
                'app_label': 'configuration',
                'models': [self._build_model_dict(m[0], m[1], request) for m in config_models]
            })

        if people_models:
            custom_app_list.append({
                'name': 'Tenant Management',
                'app_label': 'people',
                'models': [self._build_model_dict(m[0], m[1], request) for m in people_models]
            })

        if student_models:
            custom_app_list.append({
                'name': 'Students',
                'app_label': 'students',
                'models': [self._build_model_dict(m[0], m[1], request) for m in student_models]
            })

        if coupon_models:
            custom_app_list.append({
                'name': 'Coupons & Passes',
                'app_label': 'coupons',
                'models': [self._build_model_dict(m[0], m[1], request) for m in coupon_models]
            })

        if activity_models:
            custom_app_list.append({
                'name': 'Parking Activity',
                'app_label': 'activity',
                'models': [self._build_model_dict(m[0], m[1], request) for m in activity_models]
            })

        if user_models:
            custom_app_list.append({
                'name': 'User Management',
                'app_label': 'users',
                'models': [self._build_model_dict(m[0], m[1], request) for m in user_models]
            })

        return custom_app_list

    def _build_model_dict(self, model, model_admin, request):
        """Build model dictionary for navigation"""
        return {
            'name': model._meta.verbose_name_plural,
            'object_name': model._meta.object_name,
            'admin_url': reverse(
                f'{self.name}:{model._meta.app_label}_{model._meta.model_name}_changelist',
                current_app=self.name
            ),
            'add_url': reverse(
                f'{self.name}:{model._meta.app_label}_{model._meta.model_name}_add',
                current_app=self.name
            ),
            'view_only': not model_admin.has_view_permission(request),
        }


# Create instance of custom admin site
parking_admin_site = ParkingAdminSite(name='parking_admin')


# =============================================
# 2. BASE ADMIN CLASSES (FOR REUSE)
# =============================================
class BaseAdmin(admin.ModelAdmin):
    """Base class with common settings"""
    list_per_page = 25
    save_on_top = True
    save_as = True


class ReadOnlyAdmin(BaseAdmin):
    """For models that shouldn't be modified"""

    def has_add_permission(self, request): return False

    def has_change_permission(self, request, obj=None): return False

    def has_delete_permission(self, request, obj=None): return False


# =============================================
# 3. MODEL ADMIN CLASSES (REGISTERED PROPERLY)
# =============================================

# System Configuration
@admin.register(ParkingConfiguration, site=parking_admin_site)
class ParkingConfigurationAdmin(ReadOnlyAdmin):
    list_display = ('company_name', 'currency_symbol', 'tenant_allowance_enabled', 'tenant_free_hours')

    def has_add_permission(self, request):
        return not ParkingConfiguration.objects.exists()


@admin.register(PricingPlan, site=parking_admin_site)
class PricingPlanAdmin(BaseAdmin):
    list_display = ('name', 'plan_type', 'minimum_charge', 'night_rate_per_hour')
    search_fields = ('name',)
    list_filter = ('plan_type',)


@admin.register(VehicleType, site=parking_admin_site)
class VehicleTypeAdmin(BaseAdmin):
    list_display = ('name', 'pricing_plan', 'free_duration_minutes')
    autocomplete_fields = ('pricing_plan',)
    search_fields = ('name',)


# People Management
def portal_user_for(vendor):
    """The tenant-portal login this vendor's admin page manages: the first
    account linked to it in the tenant group (normally the only one)."""
    if not vendor.pk:
        return None
    users = [u for u in vendor.portal_users.all() if TENANT in {g.name for g in u.groups.all()}]
    return min(users, key=lambda u: u.pk) if users else None


class VendorAdminForm(forms.ModelForm):
    """Vendor fields plus the tenant's portal login. The password is only
    ever written (hashed); leaving it blank keeps the current one."""
    portal_email = forms.EmailField(label='Login email', required=False)
    portal_password = forms.CharField(
        label='Password', required=False, strip=False,
        widget=forms.PasswordInput(render_value=False, attrs={'autocomplete': 'new-password'}),
        help_text='Set or reset the password. Leave blank to keep the current one.',
    )
    portal_active = forms.BooleanField(
        label='Login active', required=False, initial=True,
        help_text='Untick to stop this tenant signing in, without deleting the account.',
    )

    class Meta:
        model = Vendor
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.portal_user = portal_user_for(self.instance)
        if self.portal_user:
            self.fields['portal_email'].initial = self.portal_user.email
            self.fields['portal_active'].initial = self.portal_user.is_active
            self.fields['portal_password'].help_text = (
                'A password is set. Type a new one only to reset it.')

    def clean(self):
        cleaned = super().clean()
        email = (cleaned.get('portal_email') or '').strip().lower()
        password = cleaned.get('portal_password') or ''
        cleaned['portal_email'] = email

        if not email:
            if password:
                self.add_error('portal_email', 'Enter the login email for this password.')
            elif self.portal_user:
                self.add_error('portal_email', 'To turn this login off, untick "Login active" instead.')
            return cleaned

        other = User.objects.filter(email__iexact=email).exclude(
            pk=getattr(self.portal_user, 'pk', None)).first()
        if other:
            self.add_error('portal_email', 'Another account already uses this email.')
        if not self.portal_user and not password:
            self.add_error('portal_password', 'Set a password for the new login.')
        if password:
            try:
                validate_password(password, user=self.portal_user)
            except forms.ValidationError as exc:
                self.add_error('portal_password', exc)
        return cleaned

    def save_portal_login(self, vendor):
        """Create or update the login. Called after the vendor is saved."""
        email = self.cleaned_data.get('portal_email')
        if not email:
            return
        password = self.cleaned_data.get('portal_password')
        user = self.portal_user
        if user is None:
            user = User.objects.create_user(email=email, password=password, vendor=vendor)
        else:
            user.email = email
            user.vendor = vendor
            if password:
                user.set_password(password)
        user.is_active = self.cleaned_data.get('portal_active', False)
        user.save()
        user.groups.set([Group.objects.get(name=TENANT)])


@admin.register(Vendor, site=parking_admin_site)
class VendorAdmin(BaseAdmin):
    form = VendorAdminForm
    list_display = ('name', 'location', 'contact_person', 'contact_email', 'stamp_free_minutes',
                    'student_early_grace_minutes', 'student_late_grace_minutes', 'tenant_free_hours',
                    'portal_login')
    search_fields = ('name', 'contact_person', 'location')

    def get_fieldsets(self, request, obj=None):
        portal = ('portal_email', 'portal_password', 'portal_active')
        fields = [f for f in super().get_fieldsets(request, obj)[0][1]['fields'] if f not in portal]
        return [
            (None, {'fields': fields}),
            ('Tenant portal login', {
                'fields': portal,
                'description': 'The email and password this tenant uses at /tenant-portal/login '
                               'to send student lists for approval.',
            }),
        ]

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('portal_users')

    @admin.display(description='Portal login')
    def portal_login(self, obj):
        user = portal_user_for(obj)
        if not user:
            return '—'
        return user.email if user.is_active else f'{user.email} (disabled)'

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        form.save_portal_login(obj)


class ParkingPassInline(admin.TabularInline):
    model = ParkingPass
    extra = 0
    fk_name = "staff"
    fields = ('valid_from', 'valid_until', 'price_paid', 'is_active')


class RFIDCardInline(admin.TabularInline):
    model = RFIDCard
    extra = 0
    fields = ('uid', 'is_active', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(RFIDCard, site=parking_admin_site)
class RFIDCardAdmin(BaseAdmin):
    list_display = ('uid', 'staff', 'tenant_company', 'is_active', 'created_at')
    list_filter = ('is_active', 'staff__company')
    search_fields = ('uid', 'staff__name', 'staff__license_plate', 'staff__company__name')
    autocomplete_fields = ('staff',)
    readonly_fields = ('created_at',)

    def tenant_company(self, obj):
        return obj.staff.company
    tenant_company.short_description = 'Tenant'
    tenant_company.admin_order_field = 'staff__company__name'


@admin.register(Staff, site=parking_admin_site)
class StaffAdmin(BaseAdmin):
    list_display = ('name', 'license_plate', 'company', 'vehicle_type', 'is_card_active', 'card_links')
    search_fields = ('name', 'license_plate', 'company__name')
    list_filter = ('company', 'vehicle_type', 'is_card_active')
    autocomplete_fields = ('company', 'vehicle_type')
    readonly_fields = ('card_code', 'card_issued_at')
    inlines = [RFIDCardInline, ParkingPassInline]
    actions = ['deactivate_cards', 'reactivate_cards', 'regenerate_card_code']

    def card_links(self, obj):
        return format_html(
            '<a class="button" href="javascript:void(0);" onclick="window.open(\'{}\', \'_blank\', \'width=800,height=600\');">Print (Physical)</a>&nbsp;'
            '<a class="button" href="javascript:void(0);" onclick="window.open(\'{}\', \'_blank\', \'width=400,height=600\');">Digital Card</a>',
            reverse('parking_admin:management_staff_card_print', args=[obj.card_code]),
            reverse('parking_admin:management_staff_card_digital', args=[obj.card_code]),
        )
    card_links.short_description = 'Card'

    def deactivate_cards(self, request, queryset):
        count = queryset.update(is_card_active=False)
        self.message_user(request, f'{count} card(s) deactivated. Blocked at the gate immediately.')
    deactivate_cards.short_description = "Deactivate selected cards (lost/leaked)"

    def reactivate_cards(self, request, queryset):
        count = queryset.update(is_card_active=True)
        self.message_user(request, f'{count} card(s) reactivated.')
    reactivate_cards.short_description = "Reactivate selected cards"

    def regenerate_card_code(self, request, queryset):
        for staff in queryset:
            staff.card_code = uuid.uuid4()
            staff.is_card_active = True
            staff.save(update_fields=['card_code', 'is_card_active'])
        self.message_user(
            request,
            f'{queryset.count()} card code(s) regenerated. Old physical AND digital cards for '
            'these tenants no longer work — reprint/resend.'
        )
    regenerate_card_code.short_description = "Regenerate card code (physical card lost/compromised)"

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<uuid:object_id>/card/print/',
                 self.admin_site.admin_view(views.StaffCardPrintView.as_view()),
                 name='management_staff_card_print'),
            path('<uuid:object_id>/card/digital/',
                 self.admin_site.admin_view(views.StaffCardDigitalView.as_view()),
                 name='management_staff_card_digital'),
        ]
        return custom_urls + urls


# Coupons & Passes
class CouponInline(admin.TabularInline):
    model = Coupon
    extra = 0
    fields = ('code', 'is_active', 'times_used', 'max_uses')
    readonly_fields = ('code', 'times_used')
    can_delete = False


@admin.register(CouponBatch, site=parking_admin_site)
class CouponBatchAdmin(BaseAdmin):
    list_display = ('__str__', 'number_of_coupons', 'total_price', 'is_paid', 'payment_method', 'action_links')
    list_filter = ('is_paid', 'vendor', 'purchase_date')
    search_fields = ('vendor__name', 'id')
    readonly_fields = ('total_price', 'id')
    autocomplete_fields = ('vendor',)
    inlines = [CouponInline]

    fieldsets = (
        ('Purchase Info', {
            'fields': ('vendor', 'purchase_date', 'notes')
        }),
        ('Coupon Template', {
            'description': 'Define the properties for all coupons in this batch.',
            'fields': ('validation_type', 'value_minutes', 'valid_from', 'valid_until')
        }),
        ('Payment Details', {
            'fields': ('number_of_coupons', 'base_price_per_coupon', 'total_price', 'is_paid', 'payment_method')
        }),
    )

    # Prevent editing after creation to avoid regenerating coupons
    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if obj:  # If the object already exists (is being edited)
            readonly.extend([
                'vendor',
                'validation_type',
                'value_minutes',
                'number_of_coupons',
                'purchase_date'
            ])
        return readonly

    def action_links(self, obj):
        print_url = reverse('parking_admin:management_couponbatch_print', args=[obj.pk])
        email_url = reverse('parking_admin:management_couponbatch_email', args=[obj.pk])
        return format_html(
            '<div class="">'
            '<a class="button" href="javascript:void(0);" onclick="window.open(\'{}\', \'_blank\', \'width=800,height=600\');">Print Coupons</a>&nbsp;'
            '<a class="button" href="{}">Send Email</a>'
            '</div>',
            print_url,
            email_url
        )
    action_links.short_description = 'Export Options'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<path:object_id>/print/',
                 self.admin_site.admin_view(views.CouponBatchPrintView.as_view()),
                 name='management_couponbatch_print'),
            path('<path:object_id>/email/',
                 self.admin_site.admin_view(views.CouponBatchEmailView.as_view()),
                 name='management_couponbatch_email'),
        ]
        return custom_urls + urls


@admin.register(Coupon, site=parking_admin_site)
class CouponAdmin(BaseAdmin):
    list_display = ('code', 'batch', 'validation_type', 'price', 'issued_by', 'is_active', 'times_used', 'max_uses')
    search_fields = ('code', 'issued_by__name', 'batch__id')
    list_filter = ('is_active', 'validation_type', 'issued_by', 'batch')
    readonly_fields = ('times_used', 'batch')
    autocomplete_fields = ('issued_by',)
    actions = ['deactivate_coupons']

    def deactivate_coupons(self, request, queryset):
        count = queryset.update(is_active=False)
        self.message_user(request, f'{count} coupons were deactivated.')
    deactivate_coupons.short_description = "Deactivate selected coupons"


@admin.register(ParkingPass, site=parking_admin_site)
class ParkingPassAdmin(BaseAdmin):
    list_display = ('staff', 'valid_from', 'valid_until', 'price_paid', 'payment_method', 'is_active',
                    'print_pass_link', 'email_pass_link')
    search_fields = ('staff__name', 'staff__license_plate', 'extra_vehicles__name', 'extra_vehicles__license_plate')
    list_filter = ('is_active', 'payment_method', 'reminder_enabled')
    autocomplete_fields = ('staff', 'extra_vehicles')
    readonly_fields = ('gate_cards',)
    actions = ['renew_passes']

    def gate_cards(self, obj):
        """RFID cards of every vehicle on this pass. Cards belong to the
        member, not the pass, so this is a read-only view — edit cards from
        the tenant member's page."""
        if obj is None or obj.pk is None:
            return 'Save the pass to see the RFID cards it opens the gate for.'
        now = timezone.now()
        if obj.is_valid_at(now):
            status = format_html('<strong style="color:#2e7d32">Gate access active until {}</strong>',
                                 timezone.localtime(obj.valid_until).strftime('%Y-%m-%d %H:%M'))
        elif (renewal := obj.renewal()) is not None:
            status = format_html('This pass is not current — renewed until {}',
                                 timezone.localtime(renewal.valid_until).strftime('%Y-%m-%d'))
        else:
            status = format_html('<strong style="color:#c62828">Not current — cards are refused at the gate</strong>')
        rows = [
            format_html(
                '<li><a href="{}">{}</a> — {} ({}){}</li>',
                reverse('parking_admin:management_rfidcard_change', args=[card.pk]),
                card.uid, card.staff.name, card.staff.license_plate,
                '' if card.is_active else ' — deactivated',
            )
            for staff in obj.all_vehicles()
            for card in staff.rfid_cards.all()
        ]
        cards = format_html('<ul style="margin:6px 0 0 16px">{}</ul>', format_html(''.join(rows))) if rows \
            else 'No RFID cards issued to the vehicles on this pass.'
        return format_html('{}<br>{}', status, cards)
    gate_cards.short_description = 'RFID gate access'

    fieldsets = (
        (None, {'fields': ('staff', 'extra_vehicles', 'valid_from', 'valid_until',
                           'price_paid', 'payment_method', 'reminder_enabled', 'is_active', 'notes')}),
        ('RFID cards', {'fields': ('gate_cards',)}),
    )

    def renew_passes(self, request, queryset):
        renewed, skipped = [], []
        for parking_pass in queryset.select_related('staff'):
            if parking_pass.renewal() is not None:
                skipped.append(parking_pass.staff.name)
                continue
            new_pass = parking_pass.renew()
            renewed.append(f'{parking_pass.staff.name} (until {timezone.localtime(new_pass.valid_until):%Y-%m-%d})')
        if renewed:
            self.message_user(request, f'Renewed {len(renewed)} pass(es): {", ".join(renewed)}. '
                                       'Their RFID cards work at the gate straight away.')
        if skipped:
            self.message_user(request, f'Skipped — already renewed: {", ".join(skipped)}.', level='warning')
    renew_passes.short_description = "Renew selected passes (next period, same vehicles & price)"

    def print_pass_link(self, obj):
        return format_html(
            '<a class="button" href="javascript:void(0);" onclick="window.open(\'{}\', \'_blank\', \'width=800,height=600\');">Print Pass</a>',
            reverse('parking_admin:management_parkingpass_print', args=[obj.pk])
        )

    print_pass_link.short_description = 'Print'

    def email_pass_link(self, obj):
        return format_html(
            '<a class="button" href="{}">Send Email</a>',
            reverse('parking_admin:management_parkingpass_email', args=[obj.pk])
        )

    email_pass_link.short_description = 'Email'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<path:object_id>/print/',
                 self.admin_site.admin_view(views.ParkingPassPrintView.as_view()),
                 name='management_parkingpass_print'),
            path('<path:object_id>/email/',
                 self.admin_site.admin_view(views.ParkingPassEmailView.as_view()),
                 name='management_parkingpass_email'),
        ]
        return custom_urls + urls


@admin.register(CardScanLog, site=parking_admin_site)
class CardScanLogAdmin(ReadOnlyAdmin):
    list_display = ('staff', 'action', 'source', 'reject_reason', 'scanned_at')
    list_filter = ('action', 'source')
    search_fields = ('staff__name', 'staff__license_plate', 'card_code_used')
    date_hierarchy = 'scanned_at'


@admin.register(TicketStamp, site=parking_admin_site)
class TicketStampAdmin(ReadOnlyAdmin):
    list_display = ('session', 'vendor', 'free_minutes_granted', 'stamped_at')
    list_filter = ('vendor',)
    search_fields = ('session__ticket_number', 'vendor__name')
    date_hierarchy = 'stamped_at'


@admin.register(TenantBill, site=parking_admin_site)
class TenantBillAdmin(ReadOnlyAdmin):
    list_display = ('session', 'vendor', 'overage_minutes', 'amount', 'created_at')
    list_filter = ('vendor',)
    search_fields = ('session__ticket_number', 'vendor__name')
    date_hierarchy = 'created_at'


# Parking Activity
@admin.register(ParkingSession, site=parking_admin_site)
class ParkingSessionAdmin(BaseAdmin):
    change_list_template = "admin/management/parkingsession/change_list.html"
    list_per_page = 50  # Fewer page turns, still light per request

    list_display = ('ticket_number', 'vehicle_type', 'registered_staff_member', 'entry_time', 'exit_time',
                    'status', 'calculated_charge', 'payment_method', 'auto_closed')
    search_fields = ('ticket_number', 'license_plate', 'rfid_card__uid', 'registered_staff_member__name')
    list_filter = (
        'status',
        'auto_closed',
        'vehicle_type',
        'payment_method',
        ('entry_time', DateRangeFilter),
        ('exit_time', DateRangeFilter),
    )
    actions = ['mark_paid_cash', 'mark_paid_card', 'mark_paid_online']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # Default to last 6 months so we don't load years of data; user can widen via date filter
        has_date_filter = any(
            k.startswith('entry_time') or k.startswith('exit_time')
            for k in request.GET.keys()
        )
        if not has_date_filter:
            six_months_ago = timezone.now() - timedelta(days=180)
            qs = qs.filter(entry_time__gte=six_months_ago)
        return qs

    def changelist_view(self, request, extra_context=None):
        cl = self.get_changelist_instance(request)
        queryset = cl.get_queryset(request)
        # Use a single DB aggregate for total_net — no iterating over all rows
        db_totals = queryset.valid().aggregate(total_net=Sum('calculated_charge'))
        summary_totals = {
            'total_gross': Decimal('0.00'),
            'total_discount': Decimal('0.00'),
            'total_net': db_totals['total_net'] or Decimal('0.00')
        }
        has_date_filter = any(
            k.startswith('entry_time') or k.startswith('exit_time')
            for k in request.GET.keys()
        )
        extra_context = extra_context or {}
        extra_context['summary_totals'] = summary_totals
        extra_context['currency_symbol'] = ParkingConfiguration.get_solo().currency_symbol
        extra_context['show_last_six_months_note'] = not has_date_filter
        return super().changelist_view(request, extra_context=extra_context)

    def display_undiscounted_charge(self, obj):
        currency = ParkingConfiguration.get_solo().currency_symbol
        return f"{currency}{obj.undiscounted_charge:.2f}"
    display_undiscounted_charge.short_description = 'Gross Charge'

    def display_discount_value(self, obj):
        currency = ParkingConfiguration.get_solo().currency_symbol
        return f"-{currency}{obj.discount_value:.2f}"
    display_discount_value.short_description = 'Discount'

    def _mark_as_paid_action(self, request, queryset, method):
        updatable = queryset.filter(status='COMPLETED')
        for session in updatable:
            session.mark_as_paid(method=method)
            session.save()
        self.message_user(
            request, f"{updatable.count()} session(s) marked as PAID.")

    def mark_paid_cash(self, r, q): self._mark_as_paid_action(r, q, 'CASH')
    mark_paid_cash.short_description = "Mark selected as PAID (Cash)"
    def mark_paid_card(self, r, q): self._mark_as_paid_action(r, q, 'CARD')
    mark_paid_card.short_description = "Mark selected as PAID (Card)"

    def mark_paid_online(self, r, q): self._mark_as_paid_action(
        r, q, 'ONLINE_QR')
    mark_paid_online.short_description = "Mark selected as PAID (Online/QR)"

    autocomplete_fields = ('applied_coupon',)
    readonly_fields = ('id', 'ticket_number', 'duration_minutes', 'applied_pass', 'calculated_charge',
                       'registered_staff_member', 'undiscounted_charge', 'discount_value', 'charge_after_discount',
                       'rfid_card', 'auto_closed')
    fieldsets = (
        ('Session Info', {'fields': ('id', 'ticket_number',
         'status', 'vehicle_type', 'registered_staff_member', 'rfid_card')}),
        ('Timestamps', {'fields': ('entry_time',
         'exit_time', 'duration_minutes', 'auto_closed')}),
        ('Billing Breakdown', {'fields': ('undiscounted_charge', 'discount_value', 'charge_after_discount',
         'calculated_charge', 'payment_method', 'applied_coupon', 'applied_pass')}),
        ('Notes', {'fields': ('notes',), 'classes': ('collapse',)}),
    )


# Students (tenant portal requests; the React back office has the same review screen)
def _review(request, queryset, review_status, reason=''):
    return queryset.update(review_status=review_status, reject_reason=reason,
                           reviewed_by=request.user, reviewed_at=timezone.now())


class StudentInline(admin.TabularInline):
    model = Student
    extra = 0
    fields = ('sn', 'name', 'contact_number', 'license_plate', 'vehicle_type', 'batch_start_date',
              'batch_end_date', 'class_days', 'class_time_from', 'class_time_to', 'is_active',
              'review_status', 'reject_reason')


@admin.register(StudentRequest, site=parking_admin_site)
class StudentRequestAdmin(BaseAdmin):
    list_display = ('__str__', 'vendor', 'source', 'student_count', 'status', 'submitted_by')
    list_filter = ('vendor', 'source', ('submitted_at', DateRangeFilter))
    readonly_fields = ('submitted_at', 'submitted_by')
    inlines = [StudentInline]
    actions = ['approve_all', 'reject_all']

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('vendor', 'submitted_by').prefetch_related('students')

    @admin.display(description='Students')
    def student_count(self, obj):
        return len(obj.students.all())

    @admin.action(description='Approve every student in the selected requests')
    def approve_all(self, request, queryset):
        count = _review(request, Student.objects.filter(request__in=queryset), Student.APPROVED)
        self.message_user(request, f'{count} student(s) approved.')

    @admin.action(description='Reject every student in the selected requests')
    def reject_all(self, request, queryset):
        count = _review(request, Student.objects.filter(request__in=queryset), Student.REJECTED)
        self.message_user(request, f'{count} student(s) rejected.')


@admin.register(Student, site=parking_admin_site)
class StudentAdmin(BaseAdmin):
    list_display = ('name', 'license_plate', 'vendor', 'batch_end_date', 'is_active', 'review_status')
    list_filter = ('review_status', 'is_active', 'vendor', ('batch_end_date', DateRangeFilter))
    search_fields = ('name', 'license_plate', 'contact_number')
    readonly_fields = ('card_code', 'reviewed_by', 'reviewed_at', 'created_at')
    actions = ['approve', 'reject']

    @admin.action(description='Approve selected students')
    def approve(self, request, queryset):
        self.message_user(request, f'{_review(request, queryset, Student.APPROVED)} student(s) approved.')

    @admin.action(description='Reject selected students')
    def reject(self, request, queryset):
        self.message_user(request, f'{_review(request, queryset, Student.REJECTED)} student(s) rejected.')
